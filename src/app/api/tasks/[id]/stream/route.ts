import { getTask } from "@/lib/task-runner";

// GET /api/tasks/:id/stream  — SSE stream of task status (preferred over polling)
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = () => {
        if (closed) return;
        const task = getTask(params.id);
        if (!task) {
          try {
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "not found" })}\n\n`)
            );
          } catch {
            /* 客户端已断连，controller 已 closed，终止轮询 */
            closed = true;
            clearInterval(timer);
            return;
          }
          controller.close();
          closed = true;
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(task)}\n\n`)
          );
        } catch {
          closed = true;
          clearInterval(timer);
          return;
        }
        if (task.status === "completed" || task.status === "failed" || task.status === "canceled") {
          controller.close();
          closed = true;
        }
      };

      send();
      const timer = setInterval(send, 700);
      // safety close
      setTimeout(() => {
        if (!closed) {
          clearInterval(timer);
          controller.close();
          closed = true;
        }
      }, 60_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
