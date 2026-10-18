import { useLayoutEffect, type RefObject } from "react";

const leaveMs = 200;

// Al desmontarse, deja una copia inerte que se desvanece: así cualquier forma de cerrar anima la salida.
export function useExitGhost(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const node = ref.current;
    return () => {
      if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const ghost = node.cloneNode(true) as HTMLElement;
      ghost.setAttribute("aria-hidden", "true");
      ghost.removeAttribute("id");
      ghost.style.pointerEvents = "none";
      ghost.style.visibility = "hidden";
      document.body.appendChild(ghost);
      window.requestAnimationFrame(() => {
        // En desarrollo React monta dos veces: si el original sigue en pantalla, no hubo cierre real.
        if (node.isConnected) {
          ghost.remove();
          return;
        }
        ghost.style.visibility = "";
        ghost.classList.add("is-leaving");
        window.setTimeout(() => ghost.remove(), leaveMs + 40);
      });
    };
  }, [ref]);
}
