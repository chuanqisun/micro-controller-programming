import "./style.css";

const ipInput = document.getElementById("ipInput") as HTMLInputElement;
const fetchButton = document.getElementById("fetchButton") as HTMLButtonElement;

fetchButton.addEventListener("click", async () => {
  try {
    const response = await fetch("http://localhost:3000/api/origin");
    const data = await response.json();
    ipInput.value = data.host;
  } catch (error) {
    console.error("Failed to fetch origin:", error);
    ipInput.value = "Error fetching origin";
  }
});
