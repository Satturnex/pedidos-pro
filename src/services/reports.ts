import { supabase } from "../lib/supabase";

export type ProblemReportInput = {
  userId: string;
  kind: "BUG" | "QUESTION" | "SUGGESTION" | "IMPROVEMENT";
  title: string;
  description: string;
  expected: string;
  stage: string;
  priority: "LOW" | "NORMAL" | "HIGH";
};

export async function createProblemReport(input: ProblemReportInput): Promise<void> {
  const { error } = await supabase.from("user_reports").insert({
    user_id: input.userId,
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim(),
    expected: input.expected.trim() || null,
    stage: input.stage.trim() || null,
    priority: input.priority,
  });
  if (error) throw new Error(`Não foi possível enviar o relato: ${error.message}`);
}
