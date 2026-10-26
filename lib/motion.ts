export function fadeIn(element: HTMLElement): Animation | null {
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !element.animate
  )
    return null;
  return element.animate(
    [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

// Callers close or remove the element after the exit finishes.
export async function fadeOut(element: HTMLElement): Promise<Animation | null> {
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !element.animate
  )
    return null;
  const animation = element.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(-6px)" },
    ],
    { duration: 160, easing: "ease-in", fill: "forwards" },
  );
  await animation.finished.catch(() => {});
  return animation;
}
