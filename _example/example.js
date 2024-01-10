const input = document.querySelector("#input");
const results = document.querySelector("#results");

function updateCount() {
    const s = input.value;
    results.innerText = `${s.length} "characters" (UTF-16 units), ${[...s].length} Unicode codepoints`;
}

input.addEventListener('input', () => {
    updateCount();
});
updateCount();
