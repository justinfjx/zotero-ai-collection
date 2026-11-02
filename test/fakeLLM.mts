import http from "node:http";
import type { AddressInfo } from "node:net";

export interface Captured {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

/**
 * Local stand-in for an LLM API. Answers every request with `answer` in the
 * shape the called endpoint expects. No network, no cost.
 */
export async function startFakeLLM(
  answer: unknown,
  status = 200,
  options: { rejectResponseFormat?: boolean; text?: string } = {}
) {
  const requests: Captured[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ path: req.url ?? "", headers: req.headers, body });
      res.setHeader("content-type", "application/json");
      if (options.rejectResponseFormat && body.response_format) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: { message: "Unsupported response_format" } })
        );
        return;
      }
      if (status !== 200) {
        res.statusCode = status;
        res.end(JSON.stringify({ error: { message: "boom", type: "x" } }));
        return;
      }
      if (req.url?.endsWith("/messages")) {
        // Anthropic: structured output arrives as a forced tool call or as text
        const tool = body.tools?.[0];
        res.end(
          JSON.stringify({
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: body.model,
            content: tool
              ? [
                  {
                    type: "tool_use",
                    id: "tu_1",
                    name: tool.name,
                    input: answer,
                  },
                ]
              : [{ type: "text", text: JSON.stringify(answer) }],
            stop_reason: tool ? "tool_use" : "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
          })
        );
      } else {
        res.end(
          JSON.stringify({
            id: "c_1",
            object: "chat.completion",
            created: 0,
            model: body.model,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: options.text ?? JSON.stringify(answer),
                },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })
        );
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseURL,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
