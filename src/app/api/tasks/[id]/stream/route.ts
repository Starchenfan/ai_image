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
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "not found" })}\n\n`)
          );
          controller.close();
          closed = true;
          return;
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(task)}\n\n`)
        );
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
