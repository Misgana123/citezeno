'use client';

import { useEffect, useState } from 'react';
import type { Feedback } from '@/lib/agent/types';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { speakable, timeAgo } from './answer-text';
import { rateAnswer } from './api';
import { SendToChat } from './SendToChat';

/* The small row under an answer: copy it, read it aloud (the browser's own
   voice, nothing is sent anywhere), thumbs up or down, send it to Slack (when
   connected), try again (the latest answer only), and when it was written. */

type Props = { chatId: string | null; text: string; seq?: number; at?: string; feedback?: Feedback; credits?: number; onRetry?: () => void };

export function AnswerActions({ chatId, text, seq, at, feedback, credits, onRetry }: Props) {
  const [rating, setRating] = useState<Feedback | null>(feedback ?? null);
  const [speaking, setSpeaking] = useState(false);
  const [, tick] = useState(0);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // "3 hours ago" stays true while the page is open
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => void (speaking && window.speechSynthesis.cancel()), [speaking]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast('Couldn’t copy the answer.', true);
    }
  };

  const speak = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    u.onend = u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  const rate = async (f: Feedback) => {
    if (!chatId || seq == null) return;
    const next = rating === f ? null : f;
    const before = rating;
    setRating(next);
    try {
      await rateAnswer(chatId, seq, next);
      if (next) toast('Thanks for the feedback');
    } catch (e) {
      setRating(before);
      toast((e as Error).message, true);
    }
  };

  const rated = chatId != null && seq != null;
  return (
    <div className="ch-acts" role="group" aria-label="Answer actions">
      <button type="button" className="ch-act" onClick={copy} aria-label="Copy" title="Copy">
        <Icon name="copy" />
      </button>
      {canSpeak && (
        <button type="button" className={`ch-act${speaking ? ' is-on' : ''}`} onClick={speak} aria-label={speaking ? 'Stop reading' : 'Read aloud'} title={speaking ? 'Stop reading' : 'Read aloud'} aria-pressed={speaking}>
          <Icon name={speaking ? 'stop' : 'volume'} />
        </button>
      )}
      {rated && (
        <>
          <button type="button" className={`ch-act${rating === 'up' ? ' is-on' : ''}`} onClick={() => rate('up')} aria-label="Good answer" title="Good answer" aria-pressed={rating === 'up'}>
            <Icon name="thumb-up" />
          </button>
          <button type="button" className={`ch-act${rating === 'down' ? ' is-on' : ''}`} onClick={() => rate('down')} aria-label="Bad answer" title="Bad answer" aria-pressed={rating === 'down'}>
            <Icon name="thumb-down" />
          </button>
        </>
      )}
      <SendToChat text={text} />
      {onRetry && (
        <button type="button" className="ch-act" onClick={onRetry} aria-label="Try again" title="Try again">
          <Icon name="retry" />
        </button>
      )}
      {credits != null && (
        <span className="ch-act-time" title="What this answer cost, with every search and step it took">
          {credits === 0 ? 'No credits' : `${credits} credit${credits === 1 ? '' : 's'}`}
        </span>
      )}
      {at && (
        <time className="ch-act-time" dateTime={at} title={new Date(at).toLocaleString()}>
          {timeAgo(at)}
        </time>
      )}
    </div>
  );
}
