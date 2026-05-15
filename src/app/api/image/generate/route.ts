import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { InferenceClient } from "@huggingface/inference";

const hf = new InferenceClient(process.env.HF_TOKEN ?? "");

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    console.log(`Generating image for user ${session.user.id} with prompt: ${prompt}`);

    const imageResult = await hf.textToImage({
      model: "black-forest-labs/FLUX.1-dev",
      inputs: prompt,
      parameters: {
        guidance_scale: 7.5,
        num_inference_steps: 28,
        width: 1024,
        height: 1024,
      },
    });

    const arrayBuffer = await new Response(imageResult).arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    return NextResponse.json({
      url: dataUrl,
      success: true,
    });
  } catch (error: unknown) {
    console.error("Hugging Face image generation error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to generate image";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
