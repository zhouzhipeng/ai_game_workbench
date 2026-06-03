import { describe, expect, it, vi } from "vitest";
import {
  ApimartVideoClient,
  buildApimartVideoGenerationPayload
} from "../src/providers/apimartVideo";

describe("APIMart video provider client", () => {
  it("submits Seedance video jobs and reads completed task video URLs", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://api.apimart.ai/v1/videos/generations") {
        expect(init).toMatchObject({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-apimart-test",
            "Content-Type": "application/json"
          })
        });
        expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({
          model: "doubao-seedance-2.0",
          prompt: "walk forward",
          resolution: "720p",
          size: "adaptive",
          duration: 5,
          image_urls: ["https://assets.example.com/walk.png"]
        });
        return Response.json({
          code: 200,
          data: [{ status: "submitted", task_id: "task_video_123" }]
        });
      }
      if (url === "https://api.apimart.ai/v1/tasks/task_video_123?language=zh") {
        return Response.json({
          code: 200,
          data: {
            id: "task_video_123",
            status: "completed",
            result: {
              videos: [
                {
                  url: ["https://upload.apimart.ai/f/video/task_video_123.mp4"]
                }
              ]
            }
          }
        });
      }
      return Response.json({ error: "unexpected URL" }, { status: 500 });
    });
    const client = new ApimartVideoClient({
      apiKey: "sk-apimart-test",
      baseUrl: "https://api.apimart.ai/v1/",
      fetchImpl: fetchMock
    });

    const submit = await client.createVideo(buildApimartVideoGenerationPayload({
      model: "doubao-seedance-2.0",
      prompt: "walk forward",
      firstFrameUrl: "https://assets.example.com/walk.png",
      durationSeconds: 5,
      resolution: "720p"
    }));
    const status = await client.getVideoJob("task_video_123");

    expect(submit).toMatchObject({
      id: "task_video_123",
      jobId: "task_video_123",
      status: "submitted"
    });
    expect(status).toMatchObject({
      jobId: "task_video_123",
      status: "completed",
      videoUrl: "https://upload.apimart.ai/f/video/task_video_123.mp4"
    });
  });
});
