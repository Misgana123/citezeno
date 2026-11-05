/* Shared by the contact form and its API route. */
export const TOPICS = ['General question', 'Bug report', 'Feature idea', 'Account help', 'Partnership', 'Other'] as const;
export type Topic = (typeof TOPICS)[number];
