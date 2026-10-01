import React from 'react';

/**
 * Clean internal metadata from payload (such as _latency injected by HTTP client)
 */
function cleanPayload(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  if (Array.isArray(data)) return data.map(cleanPayload);

  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === '_latency') continue;
    copy[k] = cleanPayload(v);
  }
  return copy;
}

/**
 * Format any raw response into jq-style pretty formatted string (2 spaces indentation)
 */
export function formatTerminalResponse(raw: unknown): {
  isJson: boolean;
  formattedText: string;
} {
  if (typeof raw === 'object' && raw !== null) {
    const cleaned = cleanPayload(raw);
    return {
      isJson: true,
      formattedText: JSON.stringify(cleaned, null, 2)
    };
  }

  const str = String(raw || '').trim();
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null) {
        const cleaned = cleanPayload(parsed);
        return {
          isJson: true,
          formattedText: JSON.stringify(cleaned, null, 2)
        };
      }
    } catch {
      // Fallback to raw string
    }
  }

  return {
    isJson: false,
    formattedText: str
  };
}

/**
 * Tokenize a line of JSON like `jq -C` (colorized jq):
 * - Keys: bold blue ("key":)
 * - Strings: green ("value")
 * - Numbers: white/silver (123)
 * - Booleans: white/gold (true/false)
 * - Null: gray (null)
 * - Braces/brackets: white ({, }, [, ])
 * - Punctuation: gray (:, ,)
 */
function tokenizeJqLine(line: string): { indent: string; tokens: Array<{ text: string; type: string }> } {
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  const content = line.slice(indent.length);

  const tokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[\[\]{},:])/g;
  const tokens: Array<{ text: string; type: string }> = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ text: content.slice(lastIdx, match.index), type: 'space' });
    }
    const full = match[0];
    if (full.endsWith(':')) {
      const keyName = full.slice(0, -1).trim();
      tokens.push({ text: keyName, type: 'key' });
      tokens.push({ text: ':', type: 'colon' });
      lastIdx = tokenRegex.lastIndex;
      continue;
    } else if (full.startsWith('"')) {
      tokens.push({ text: full, type: 'string' });
    } else if (/^(true|false)$/.test(full)) {
      tokens.push({ text: full, type: 'boolean' });
    } else if (full === 'null') {
      tokens.push({ text: full, type: 'null' });
    } else if (/^-?\d+/.test(full)) {
      tokens.push({ text: full, type: 'number' });
    } else if (/[\[\]{}]/.test(full)) {
      tokens.push({ text: full, type: 'bracket' });
    } else if (full === ',') {
      tokens.push({ text: full, type: 'comma' });
    } else {
      tokens.push({ text: full, type: 'other' });
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < content.length) {
    tokens.push({ text: content.slice(lastIdx), type: 'text' });
  }

  return { indent, tokens };
}

/**
 * Render JSON formatted with exact `jq` syntax colors:
 * - `"key"`: blue (`#3b82f6` / `text-blue-400 font-bold`)
 * - `"value"`: green (`#22c55e` / `text-emerald-400 font-medium`)
 * - `123`: white (`#f4f4f5` / `text-zinc-100 font-mono`)
 * - `true` / `false`: golden yellow (`#fde047` / `text-yellow-300 font-medium`)
 * - `null`: dim gray (`#71717a` / `text-zinc-500 italic`)
 * - `{`, `}`, `[`, `]`: bright zinc (`#fafafa` / `text-zinc-100 font-bold`)
 * - `:`, `,`: neutral gray (`#a1a1aa` / `text-zinc-400`)
 */
export const CLI_HELP_TEXT = `TasHOME Command Line Interface (CLI) Help

Lệnh Hệ Thống:
  help                     Hiển thị bảng trợ giúp này
  clear                    Xóa toàn bộ màn hình console

Nguồn & Công Tắc (Relay):
  Power1 TOGGLE            Đảo trạng thái Relay 1
  Power1 ON | OFF          Bật / Tắt Relay 1
  Power2 TOGGLE            Đảo trạng thái Relay 2 (Chuông/Tải phụ)
  Power2 ON | OFF          Bật / Tắt Relay 2

Truy Vấn Thông Số & Cảm Biến:
  Status 0                 Toàn bộ thông tin thiết bị (Full Status)
  Status 1                 Trạng thái tham số tổng quát
  Status 2                 Thông tin Firmware & phiên bản Core
  Status 4                 Bộ nhớ RAM Heap & Flash
  Status 5                 Cấu hình Mạng LAN / IP / Gateway
  Status 8                 Dữ liệu Điện năng & Cảm biến (Sensor)
  State                    Báo cáo trạng thái hoạt động tức thời

Cấu Hình Phần Cứng & Mạng:
  GPIO 255                 Xuất sơ đồ chân GPIO hiện tại
  Wifi 1                   Quét & hiển thị mạng Wi-Fi
  Restart 1                Khởi động lại vi điều khiển ESP
  TelePeriod <sec>         Đặt chu kỳ gửi dữ liệu (mặc định 300s)
  Backlog <cmd1>;<cmd2>    Thực thi chuỗi lệnh liên tiếp`;

export const CLI_COMMAND_SUGGESTIONS = [
  { cmd: 'help', desc: 'Bảng trợ giúp lệnh' },
  { cmd: 'clear', desc: 'Xóa màn hình console' },
  { cmd: 'Power1 TOGGLE', desc: 'Đảo trạng thái Relay 1' },
  { cmd: 'Power1 ON', desc: 'Bật Relay 1' },
  { cmd: 'Power1 OFF', desc: 'Tắt Relay 1' },
  { cmd: 'Power2 TOGGLE', desc: 'Đảo trạng thái Relay 2' },
  { cmd: 'Power2 ON', desc: 'Bật Relay 2' },
  { cmd: 'Power2 OFF', desc: 'Tắt Relay 2' },
  { cmd: 'Status 0', desc: 'Toàn bộ thông số thiết bị' },
  { cmd: 'Status 1', desc: 'Tham số tổng quát' },
  { cmd: 'Status 2', desc: 'Thông tin Firmware' },
  { cmd: 'Status 4', desc: 'Bộ nhớ Heap & Flash' },
  { cmd: 'Status 5', desc: 'Mạng LAN & IP' },
  { cmd: 'Status 8', desc: 'Cảm biến & Điện năng' },
  { cmd: 'State', desc: 'Trạng thái hoạt động' },
  { cmd: 'GPIO 255', desc: 'Sơ đồ chân GPIO' },
  { cmd: 'Wifi 1', desc: 'Quét mạng Wi-Fi' },
  { cmd: 'Restart 1', desc: 'Khởi động lại ESP' },
  { cmd: 'TelePeriod 300', desc: 'Chu kỳ telemetry' },
  { cmd: 'Backlog', desc: 'Chuỗi nhiều lệnh' }
];

export function renderSyntaxHighlightedText(rawInput: unknown): React.ReactNode {

  const { formattedText } = formatTerminalResponse(rawInput);
  const lines = formattedText.split('\n');

  return (
    <pre className="font-mono text-[11px] leading-relaxed select-text font-normal m-0 p-0 whitespace-pre overflow-x-auto">
      {lines.map((line, lineIdx) => {
        const { indent, tokens } = tokenizeJqLine(line);

        if (tokens.length === 0) {
          return (
            <div key={lineIdx} className="min-h-[1.2rem] text-zinc-300">
              {line}
            </div>
          );
        }

        return (
          <div key={lineIdx} className="leading-relaxed">
            {indent}
            {tokens.map((tok, tokIdx) => {
              switch (tok.type) {
                case 'key':
                  // jq bold blue
                  return (
                    <span key={tokIdx} className="text-blue-400 font-bold">
                      {tok.text}
                    </span>
                  );
                case 'string':
                  // jq green string
                  if (tok.text === '"ON"') {
                    return (
                      <span key={tokIdx} className="text-emerald-400 font-bold">
                        {tok.text}
                      </span>
                    );
                  }
                  if (tok.text === '"OFF"') {
                    return (
                      <span key={tokIdx} className="text-rose-400 font-bold">
                        {tok.text}
                      </span>
                    );
                  }
                  return (
                    <span key={tokIdx} className="text-emerald-400">
                      {tok.text}
                    </span>
                  );
                case 'colon':
                  return (
                    <span key={tokIdx} className="text-zinc-400">
                      {tok.text}
                    </span>
                  );
                case 'comma':
                  return (
                    <span key={tokIdx} className="text-zinc-400">
                      {tok.text}
                    </span>
                  );
                case 'number':
                  // jq white number
                  return (
                    <span key={tokIdx} className="text-zinc-100 font-mono">
                      {tok.text}
                    </span>
                  );
                case 'boolean':
                  // jq boolean
                  return (
                    <span key={tokIdx} className="text-yellow-300 font-semibold">
                      {tok.text}
                    </span>
                  );
                case 'null':
                  // jq null (gray)
                  return (
                    <span key={tokIdx} className="text-zinc-500 italic">
                      {tok.text}
                    </span>
                  );
                case 'bracket':
                  // jq brackets/braces (bold white)
                  return (
                    <span key={tokIdx} className="text-zinc-100 font-bold">
                      {tok.text}
                    </span>
                  );
                case 'space':
                  return <span key={tokIdx}>{tok.text}</span>;
                default:
                  return (
                    <span key={tokIdx} className="text-zinc-300">
                      {tok.text}
                    </span>
                  );
              }
            })}
          </div>
        );
      })}
    </pre>
  );
}
