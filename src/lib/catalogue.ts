// Metadata verified against https://developers.deepgram.com/docs/tts-models on 2026-10-05.
export const voices = [
  { id: "aura-2-pandora-en", name: "Lily", language: "English", accent: "British", style: "Soft, calm and flowing" },
  {
    id: "aura-2-thalia-en",
    name: "Chloe",
    language: "English",
    accent: "American",
    style: "Clear, confident, energetic",
  },
  {
    id: "aura-2-andromeda-en",
    name: "Amy",
    language: "English",
    accent: "American",
    style: "Casual, expressive, comfortable",
  },
  {
    id: "aura-2-helena-en",
    name: "Ella",
    language: "English",
    accent: "American",
    style: "Caring, natural, friendly",
  },
  {
    id: "aura-2-apollo-en",
    name: "Max",
    language: "English",
    accent: "American",
    style: "Confident, comfortable, casual",
  },
  {
    id: "aura-2-arcas-en",
    name: "Sam",
    language: "English",
    accent: "American",
    style: "Natural, smooth, clear",
  },
  {
    id: "aura-2-draco-en",
    name: "Ben",
    language: "English",
    accent: "British",
    style: "Warm, approachable, baritone",
  },
] as const;
export const featuredVoices = [
  voices.find(v => v.id === "aura-2-draco-en")!,
  voices.find(v => v.id === "aura-2-pandora-en")!,
  voices.find(v => v.id === "aura-2-helena-en")!,
  voices.find(v => v.id === "aura-2-andromeda-en")!,
  voices.find(v => v.id === "aura-2-arcas-en")!,
  voices.find(v => v.id === "aura-2-apollo-en")!,
];
export const previewText =
  "Hello, thanks for calling. How can I help you today?";
export const voiceIds = voices.map((v) => v.id);
export const problems = [
  "Calls outside opening hours",
  "Calls missed while staff are busy",
  "Repetitive questions",
  "Appointment bookings",
  "Changes or cancellations",
  "Capturing new enquiries",
  "Callback requests",
  "Passing requests to the right person",
  "Something else",
];
export const categories = [
  "Beauty and wellness",
  "Healthcare and clinics",
  "Home and field services",
  "Professional services",
  "Retail",
  "Hospitality",
  "Education",
  "Other",
];
export const taskOptions = [
  "Answer FAQs",
  "Capture enquiries",
  "Record callback requests",
  "Flag for staff",
  "Demo appointments",
] as const;
export function composePrompt(
  description: string,
  selected: string[],
  other = "",
) {
  return `Create an AI demo receptionist for ${description.trim().replace(/[.!?]+$/, "") || "my business"}. Help with ${
    selected
      .filter((p) => p !== "Something else")
      .map((p) => p.toLowerCase())
      .join(", ") || "answering questions and recording enquiries"
  }. ${other ? `Additional need: ${other}. ` : ""}Use the business facts I supply. If a request needs a person, record details for staff follow-up. All actions are in a demo workspace.`;
}
