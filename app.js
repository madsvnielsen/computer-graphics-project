import { runMarbleMaze } from "./src/MarbleMaze.js";

window.addEventListener("load", () => {
  const canvas = document.getElementById("my-canvas");

  const ui = {
    kd: document.getElementById("kdScale"),
    ks: document.getElementById("ksScale"),
    shininess: document.getElementById("shininess"),
    Le: document.getElementById("Le"),
    La: document.getElementById("La"),
    rot: document.getElementById("rotSpeed"),
  };

  runMarbleMaze({ canvas, ui });
});
