/** Decorative pointer depth; no continuous rendering loop or external assets. */
export function setupResearchScene() {
  const scene = document.querySelector<HTMLElement>("[data-depth-scene]");
  const artifact = scene?.querySelector<HTMLElement>(".research-artifact");
  if (!scene || !artifact) return;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = matchMedia("(pointer: fine)");
  let frame = 0;
  const reset = () => {
    cancelAnimationFrame(frame);
    artifact.style.removeProperty("--pitch");
    artifact.style.removeProperty("--yaw");
  };
  scene.addEventListener("pointermove", (event) => {
    if (motion.matches || !pointer.matches) return;
    const bounds = scene.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      artifact.style.setProperty("--pitch", `${-8 - y * 10}deg`);
      artifact.style.setProperty("--yaw", `${-16 + x * 15}deg`);
    });
  });
  scene.addEventListener("pointerleave", reset);
  motion.addEventListener("change", reset);
}
