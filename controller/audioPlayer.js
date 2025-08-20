// audioPlayer.js
let audioElement = null;

export function playAudio(audioUrl) {
  if (!audioUrl) return;

  // Create new element if none exists
  if (!audioElement) {
    audioElement = new Audio(audioUrl);
  } else {
    audioElement.src = audioUrl; // change track
  }

  audioElement.load();
  audioElement.play()
    .then(() => console.log("Playing audio:", audioUrl))
    .catch(err => console.error("Audio play failed:", err));
}
