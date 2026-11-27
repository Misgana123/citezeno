import { describe, expect, it } from 'vitest';
import { cleanTitle, takeTitle } from '@/lib/agent/title';

/* A new chat's title comes with the model's first reply, in a tag the user never sees. */
describe('a chat title from the first reply', () => {
  it('takes the tag out of the reply wherever it is', () => {
    expect(takeTitle('<title>Sleep and memory</title>\nHere is what I found.')).toEqual({ title: 'Sleep and memory', text: 'Here is what I found.' });
    expect(takeTitle('Here.\n\n<TITLE> Teen sleep </TITLE>')).toEqual({ title: 'Teen sleep', text: 'Here.' });
    expect(takeTitle('No tag at all.')).toEqual({ title: null, text: 'No tag at all.' });
    expect(takeTitle('<title></title>Answer.')).toEqual({ title: null, text: 'Answer.' });
  });

  it('cleans a title to one plain line: no quotes, marks or ending period, and not too long', () => {
    expect(cleanTitle('"Sleep and memory."')).toBe('Sleep and memory');
    expect(cleanTitle('**Sleep**\nand _memory_')).toBe('Sleep and memory');
    expect(cleanTitle('x'.repeat(200))).toHaveLength(80);
    expect(cleanTitle(42)).toBeNull();
    expect(cleanTitle(' ')).toBeNull();
  });
});
