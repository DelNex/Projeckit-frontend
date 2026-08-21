/**
 * @jest-environment jsdom
 */

import { appendAssistantActionBar } from '../components/rich-renderer.js';

describe('Frontend Chat UI — Assistant Action Bar', () => {
  it('1. Appends Copy, Redo, Like, Dislike buttons to an assistant message container', () => {
    const container = document.createElement('div');
    container.textContent = 'Here is the assistant answer.';

    const onRedoMock = jest.fn();
    appendAssistantActionBar(container, 'Here is the assistant answer.', onRedoMock);

    const bar = container.querySelector('.ai-message-action-bar');
    expect(bar).not.toBeNull();

    const copyBtn = bar.querySelector('.btn-action-copy');
    const redoBtn = bar.querySelector('.btn-action-redo');
    const likeBtn = bar.querySelector('.btn-action-like');
    const dislikeBtn = bar.querySelector('.btn-action-dislike');

    expect(copyBtn).not.toBeNull();
    expect(redoBtn).not.toBeNull();
    expect(likeBtn).not.toBeNull();
    expect(dislikeBtn).not.toBeNull();

    // Trigger Redo
    redoBtn.click();
    expect(onRedoMock).toHaveBeenCalledTimes(1);
  });

  it('2. Prevents duplicate action bar insertion', () => {
    const container = document.createElement('div');
    appendAssistantActionBar(container, 'Test', jest.fn());
    appendAssistantActionBar(container, 'Test', jest.fn());

    const bars = container.querySelectorAll('.ai-message-action-bar');
    expect(bars.length).toBe(1);
  });
});
