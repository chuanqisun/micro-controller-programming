import "./style.css";

const ipInput = document.getElementById("ipInput") as HTMLInputElement;
const fetchButton = document.getElementById("fetchButton") as HTMLButtonElement;

fetchButton.addEventListener("click", async () => {
  try {
    const response = await fetch("http://localhost:3000/api/host");
    const host = await response.text();
    ipInput.value = host;
  } catch (error) {
    console.error("Failed to fetch host:", error);
    ipInput.value = "Error fetching host";
  }
});
