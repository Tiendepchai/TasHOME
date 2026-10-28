#!/usr/bin/python3
"""Offline fixtures only. Run: python3 -I deploy/rollback.self-check.py"""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('release.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    r.ROOT = base / 'app'
    r.ROOT.mkdir()
    r.DROP = base / 'systemd' / '90-tashome.conf'
    r.TEMPLATE = Path(__file__).with_name('smarthome.conf')
    artifact = base / 'artifact'
    artifact.mkdir()
    def fixture(version):
        binary = artifact / 'tashome-linux-arm64'
        binary.write_bytes(b'\x7fELF\x02\x01' + b'\x00' * 12 + b'\xb7\x00' + version.encode())
        manifest = {'version': version, 'target': 'bun-linux-arm64', 'binary': binary.name,
                    'sha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
        (artifact / 'manifest.json').write_text(json.dumps(manifest))
        (artifact / 'SHA256SUMS').write_text(''.join(
            hashlib.sha256((artifact / name).read_bytes()).hexdigest() + '  ' + name + '\n'
            for name in ('tashome-linux-arm64', 'manifest.json')))
    def failed_install():
        try:
            r.install(artifact)
        except RuntimeError as error:
            assert str(error) == 'New release health failed'
        else:
            raise AssertionError('Expected failure')
    # Ownership assertions remain checked by fixture through a root UID stat shim only.
    real_stat = Path.stat
    def root_stat(path, *args, **kwargs):
        import os
        values = list(real_stat(path, *args, **kwargs))
        values[4] = 0
        return os.stat_result(values)
    calls = []
    with patch.object(Path, 'stat', root_stat), patch.object(r, 'preflight'), \
            patch.object(r.platform, 'machine', return_value='aarch64'), \
            patch.object(r, 'systemctl', lambda *args: calls.append(args)):
        fixture('a' * 40)
        with patch.object(r, 'health', side_effect=[False, True]) as probe:
            failed_install()
            assert probe.call_args.args == (None,)
        assert not (r.ROOT / 'current').exists() and not r.DROP.exists()
        with patch.object(r, 'health', return_value=True):
            r.install(artifact)
        prior = (r.ROOT / 'current').readlink()
        r.DROP.write_bytes(r.DROP.read_bytes() + b'# previous override\n')
        drop = r.DROP.read_bytes()
        fixture('b' * 40)
        with patch.object(r, 'health', side_effect=[False, True]) as probe:
            failed_install()
            assert probe.call_args.args == ('a' * 40,)
        assert (r.ROOT / 'current').readlink() == prior
        assert r.DROP.read_bytes() == drop
        assert list(r.DROP.parent.glob('90-tashome.conf.backup-*'))
        with patch.object(r, 'health', return_value=True):
            r.install(artifact)
            before = len(calls)
            r.install(artifact)
            assert len(calls) == before, 'Idempotent deploy restarted service'
        downloads = []
        def metadata_only(url, destination, limit):
            downloads.append(url)
            assert url == r.API, 'Healthy current release downloaded an artifact'
            destination.write_text(json.dumps({'tag_name': 'binary-' + 'b' * 40,
                'draft': False, 'prerelease': False,
                'assets': [{'name': name} for name in r.ASSETS]}))
        download_dir = base / 'download'
        download_dir.mkdir()
        with patch.object(r, 'download', metadata_only), patch.object(r, 'health', return_value=True):
            r.update(download_dir)
        assert downloads == [r.API]
        wrong_elf = base / 'wrong-elf'
        wrong_elf.write_bytes(b'not an ELF file at all')
        try:
            r.elf_target(wrong_elf)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Accepted invalid ELF target')
        (artifact / 'SHA256SUMS').write_text('invalid\n')
        before = len(calls)
        try:
            r.install(artifact)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Accepted invalid checksum')
        assert len(calls) == before, 'Validation failure touched service'
print('PASS: first-install Node recovery, release rollback, success, idempotence, preflight rejection')
