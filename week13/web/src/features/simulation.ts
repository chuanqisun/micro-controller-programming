export function initSimulationUI() {
  const startBtn = document.getElementById("start") as HTMLButtonElement;

  startBtn.onclick = () => {
    fetch("http://localhost:3000/api/ai/start", {
      method: "POST",
    });
  };
}
