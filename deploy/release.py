#!/usr/bin/python3
"""Root-only release installer. No state migration, backup restoration or pruning."""
import fcntl
import hashlib
import json
import os
import platform
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = Path('/opt/tashome')
DROP = Path('/etc/systemd/system/smarthome.service.d/90-tashome.conf')
LOCK = Path('/run/lock/tashome-deploy.lock')
TEMPLATE = Path('/usr/local/lib/tashome/smarthome.conf')
API = 'https://api.github.com/repos/Tiendepchai/TasHOME/releases/latest'
ASSETS = {'tashome-linux-arm64', 'manifest.json', 'SHA256SUMS'}
SHA = r'[0-9a-f]{40}'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


class HTTPSRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url = urllib.parse.urlsplit(newurl)
        require(url.scheme == 'https' and url.hostname == 'release-assets.githubusercontent.com'
                and url.port in (None, 443) and not url.username and not url.password
                and re.fullmatch(r'/github-production-release-asset/[^/]+/[^/]+', url.path),
                'Unexpected asset redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url, destination, limit):
    opener = urllib.request.build_opener(HTTPSRedirect())
    request = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'TasHOME-updater'})
    with opener.open(request, timeout=60) as response, destination.open('xb') as output:
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            require(total <= limit, 'Download exceeds size limit')
            output.write(chunk)


def validate(directory, expected=None):
    for name in ASSETS:
        require((directory / name).is_file() and not (directory / name).is_symlink(), 'Missing or symlinked artifact')
    manifest = json.loads((directory / 'manifest.json').read_text())
    version = manifest.get('version', '')
    require(isinstance(version, str) and re.fullmatch(SHA, version), 'Invalid version')
    require(expected is None or expected == version, 'Release tag/version mismatch')
    require(manifest.get('target') == 'bun-linux-arm64' and manifest.get('binary') == 'tashome-linux-arm64', 'Wrong binary target/name')
    digest = hashlib.sha256((directory / 'tashome-linux-arm64').read_bytes()).hexdigest()
    require(manifest.get('sha256') == digest, 'Manifest digest mismatch')
    checksums = {}
    for line in (directory / 'SHA256SUMS').read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  (tashome-linux-arm64|manifest\.json)', line)
        require(match is not None and match[2] not in checksums, 'Invalid checksum entry')
        checksums[match[2]] = match[1]
    require(set(checksums) == {'manifest.json', 'tashome-linux-arm64'}, 'Incomplete checksums')
    for name, expected_digest in checksums.items():
        require(hashlib.sha256((directory / name).read_bytes()).hexdigest() == expected_digest, 'Checksum mismatch')
    return version, digest


def systemctl(*args):
    subprocess.run(['/usr/bin/systemctl', *args], check=True)


def health(version):
    for _ in range(30):
        try:
            systemctl('is-active', '--quiet', 'smarthome.service')
            def get(path):
                request = urllib.request.Request('http://127.0.0.1:3000' + path)
                # Never follow app redirects or use external proxies for local health.
                class NoRedirect(urllib.request.HTTPRedirectHandler):
                    def redirect_request(self, *args):
                        return None
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
                with opener.open(request, timeout=2) as response:
                    return response.headers.get_content_type(), response.read(4 * 1024 * 1024)
            if version is not None:
                _, body = get('/healthz')
                result = json.loads(body)
                require(result.get('status') == 'ok' and result.get('version') == version, 'Unhealthy version')
            content_type, body = get('/')
            require(content_type == 'text/html', 'SPA is not HTML')
            html = body.decode()
            asset = re.search(r'(?:src|href)=[\"\'](/assets/[A-Za-z0-9_./-]+\.(?:js|css))[\"\']', html)
            require(asset is not None and '..' not in asset[1], 'Missing SPA asset')
            content_type, body = get(asset[1])
            require(body and content_type != 'text/html', 'SPA asset fetch failed')
            return True
        except Exception:
            time.sleep(1)
    return False


def atomic_link(target):
    temporary = ROOT / '.current-next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, ROOT / 'current')


def preflight():
    require(platform.machine() == 'aarch64', 'Requires aarch64 host')
    runtime = Path('/etc/tashome/runtime.env')
    require(runtime.is_file() and not runtime.is_symlink()
            and runtime.stat().st_uid == 0 and runtime.stat().st_mode & 0o777 == 0o600,
            'runtime.env must be root-owned regular file mode 0600')
    state = Path('/opt/smarthome')
    totp = state / '.totp_secret'
    require(state.is_dir() and totp.is_file() and not totp.is_symlink(), 'Existing state TOTP file required')
    cwd = subprocess.check_output(['/usr/bin/systemctl', 'show', 'smarthome.service',
                                   '--property=WorkingDirectory', '--value'], text=True).strip()
    require(cwd == str(state), 'Unexpected service WorkingDirectory')


def elf_target(binary):
    with binary.open('rb') as source:
        header = source.read(20)
    require(len(header) == 20 and header[:6] == b'\x7fELF\x02\x01'
            and header[18:20] == b'\xb7\x00', 'Requires little-endian ELF64 AArch64 binary')


def install(directory, expected=None):
    preflight()
    version, digest = validate(directory, expected)
    elf_target(directory / 'tashome-linux-arm64')
    current = ROOT / 'current'
    require(not current.exists() or current.is_symlink(), 'current must be a symlink')
    previous = os.readlink(current) if current.is_symlink() else None
    if previous is not None:
        require(re.fullmatch(re.escape(str(ROOT)) + '/releases/' + SHA, previous), 'Unexpected current target')
    require(not DROP.is_symlink(), 'Drop-in must not be a symlink')
    old_drop = DROP.read_bytes() if DROP.exists() else None
    new_drop = TEMPLATE.read_bytes()
    releases = ROOT / 'releases'
    releases.mkdir(mode=0o755, exist_ok=True)
    require(not releases.is_symlink() and releases.stat().st_uid == 0 and not releases.stat().st_mode & 0o022,
            'Unsafe release directory ownership/mode')
    release = releases / version
    if release.exists():
        require(not release.is_symlink() and (release / 'tashome').is_file()
                and not (release / 'tashome').is_symlink()
                and release.stat().st_uid == 0 and not release.stat().st_mode & 0o222
                and (release / 'tashome').stat().st_uid == 0
                and not (release / 'tashome').stat().st_mode & 0o222
                and hashlib.sha256((release / 'tashome').read_bytes()).hexdigest() == digest,
                'Existing release differs or is mutable')
    else:
        with tempfile.TemporaryDirectory(prefix='.stage-', dir=releases) as temporary:
            staged = Path(temporary) / version
            staged.mkdir()
            shutil.copyfile(directory / 'tashome-linux-arm64', staged / 'tashome')
            require(hashlib.sha256((staged / 'tashome').read_bytes()).hexdigest() == digest, 'Staged digest mismatch')
            (staged / 'tashome').chmod(0o555)
            os.rename(staged, release)
            release.chmod(0o555)
    if previous == str(release) and old_drop == new_drop and health(version):
        return
    DROP.parent.mkdir(parents=True, exist_ok=True)
    if old_drop is not None and old_drop != new_drop:
        # Keep each replaced drop-in for operator inspection; never back up state here.
        with tempfile.NamedTemporaryFile(prefix='90-tashome.conf.backup-', dir=DROP.parent, delete=False) as backup:
            backup.write(old_drop)
    def write_drop(content):
        with tempfile.NamedTemporaryFile(prefix='.tashome-', dir=DROP.parent, delete=False) as output:
            output.write(content)
            output.flush()
            os.fchmod(output.fileno(), 0o644)
            os.fsync(output.fileno())
        os.replace(output.name, DROP)
    try:
        # Everything validated/staged before the service is stopped by restart.
        atomic_link(str(release))
        write_drop(new_drop)
        systemctl('daemon-reload')
        systemctl('restart', 'smarthome.service')
        require(health(version), 'New release health failed')
    except BaseException:
        # Let systemd timeout termination complete recovery before any second signal.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        if previous is None:
            current.unlink(missing_ok=True)
        else:
            atomic_link(previous)
        if old_drop is None:
            DROP.unlink(missing_ok=True)
        else:
            write_drop(old_drop)
        systemctl('daemon-reload')
        systemctl('restart', 'smarthome.service')
        recovered = health(Path(previous).name if previous else None)
        require(recovered, 'ROLLBACK FAILED: operator intervention required; state untouched')
        raise


def update(directory):
    metadata = directory / 'release.json'
    download(API, metadata, 1024 * 1024)
    release = json.loads(metadata.read_text())
    tag = release.get('tag_name', '')
    require(isinstance(tag, str) and re.fullmatch('binary-' + SHA, tag)
            and release.get('draft') is False and release.get('prerelease') is False, 'Not a stable binary release')
    assets = release.get('assets', [])
    require(isinstance(assets, list), 'Invalid asset list')
    selected = [asset for asset in assets if asset.get('name') in ASSETS]
    require(len(selected) == 3 and {asset['name'] for asset in selected} == ASSETS, 'Missing/duplicate release assets')
    current = ROOT / 'current'
    version = tag[7:]
    if current.is_symlink() and os.readlink(current) == str(ROOT / 'releases' / version):
        preflight()
        if DROP.is_file() and not DROP.is_symlink() and DROP.read_bytes() == TEMPLATE.read_bytes() and health(version):
            return
    for asset in selected:
        name = asset['name']
        url = 'https://github.com/Tiendepchai/TasHOME/releases/download/' + tag + '/' + name
        require(asset.get('browser_download_url') == url, 'Unexpected asset URL')
        download(url, directory / name, 256 * 1024 * 1024 if name == 'tashome-linux-arm64' else 65536)
    install(directory, tag[7:])


def main():
    require(os.geteuid() == 0, 'Run as root')
    require(len(sys.argv) in (2, 3), 'Usage: release.py update | deploy DIRECTORY')
    require(ROOT.is_dir() and not ROOT.is_symlink() and ROOT.stat().st_uid == 0
            and not ROOT.stat().st_mode & 0o022, '/opt/tashome must be root-owned, not group/world writable')
    os.umask(0o022)
    def interrupted(signum, frame):
        raise RuntimeError('Deployment interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if sys.argv[1:] == ['update']:
            with tempfile.TemporaryDirectory(prefix='tashome-download-') as temporary:
                update(Path(temporary))
        elif len(sys.argv) == 3 and sys.argv[1] == 'deploy':
            # Snapshot caller-supplied files before validation; never execute from input directory.
            with tempfile.TemporaryDirectory(prefix='tashome-input-') as temporary:
                for name in ASSETS:
                    source = Path(sys.argv[2]) / name
                    require(source.is_file() and not source.is_symlink(), 'Invalid artifact')
                    shutil.copyfile(source, Path(temporary) / name)
                install(Path(temporary))
        else:
            raise RuntimeError('Usage: release.py update | deploy DIRECTORY')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('TasHOME deployment failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
