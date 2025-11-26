import { runMarbleMaze } from "./src/MarbleMaze.js";

window.addEventListener("load", () => {
  const canvas = document.getElementById("my-canvas");
  runMarbleMaze({ canvas });
});
