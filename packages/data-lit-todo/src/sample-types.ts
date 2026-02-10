// © 2026 Adobe. MIT License. See /LICENSE for details.

export interface SampleMetadata {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly difficulty: "beginner" | "intermediate" | "advanced";
  readonly features: readonly string[];
}

export interface Sample extends SampleMetadata {
  readonly elementTag: string;
}
