// Moves an element to <body> so fixed overlays (dialogs, drawers) are positioned against the
// window, not against an animated page container.
export function portal(node) {
  document.body.appendChild(node);
  return { destroy() { node.remove(); } };
}
