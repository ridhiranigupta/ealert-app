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

export interface ContactFormValues {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export const emptyContactValues: ContactFormValues = {
  name: "",
  relationship: "",
  phone: "",
  email: "",
};
