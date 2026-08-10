export const relationships = [
  "Mother",
  "Father",
  "Brother",
  "Sister",
  "Friend",
  "Partner",
  "Relative",
  "Colleague",
  "Neighbor",
  "Other",
] as const;

export const channelOptions = [
  { value: "sms", label: "SMS", hint: "Text message" },
  { value: "email", label: "Email", hint: "Email (needs an address)" },
  { value: "push", label: "Push", hint: "App push (needs setup)" },
] as const;

export type ContactChannel = "sms" | "email" | "push";

export interface ContactFormValues {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  active: boolean;
  channels: ContactChannel[];
}

export const emptyContactValues: ContactFormValues = {
  name: "",
  relationship: "",
  phone: "",
  email: "",
  active: true,
  channels: [],
};
