const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement;

export function initGameUI() {
  newGameBtn.addEventListener("click", async () => {
    await fetch("http://localhost:3000/api/game/new", { method: "POST" });
  });
}
