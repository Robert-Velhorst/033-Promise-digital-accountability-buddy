import { parseFragment } from 'parse5';

// Extract plain text, never executable markup. Rendering must still escape text.
export function htmlText(source) {
  const fragment = parseFragment(source);
  const pending = [fragment];
  const text = [];
  while (pending.length) {
    const node = pending.pop();
    if (node === '\n') { text.push(node); continue; }
    if (node.nodeName === '#text') { text.push(node.value); continue; }
    if (node.tagName === 'script' || node.tagName === 'style') continue;
    if (node.tagName === 'br') text.push('\n');
    if (node.tagName === 'p') pending.push('\n');
    const children = node.content?.childNodes || node.childNodes || [];
    for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]);
  }
  return text.join('');
}
