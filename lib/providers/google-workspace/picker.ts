import type { FilePicker } from '../connectors/types';
import type { Env } from '../types';

/* Google Picker, shown on our page so the user grants files one by one. */
const SCRIPT = 'https://apis.google.com/js/api.js';

export function googlePicker(env: Env): (accessToken: string) => FilePicker | null {
  const apiKey = env.GOOGLE_PICKER_API_KEY?.trim();
  const appId = env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim();
  return (accessToken) => (apiKey && appId ? { type: 'google-picker', scriptUrl: SCRIPT, apiKey, appId, accessToken } : null);
}
