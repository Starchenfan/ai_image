import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/templates
// Prompt templates. Starts empty — admin can seed templates at runtime;
// none are hard-coded.
export async function GET() {
  return NextResponse.json({ templates: db.templates });
}
