export class AudioManager {
  constructor(strapiBaseUrl, audioMapping) {
    this.strapiBaseUrl = strapiBaseUrl;
    this.audioMapping = audioMapping; // Maps phase names to errorIds
    this.audioCache = new Map(); // Cache loaded audio files
    this.isEnabled = true;
  }

  // Fetch audio file from Strapi by errorId
  async fetchAudioFromStrapi(errorId) {
    try {
      const response = await fetch(
        `${this.strapiBaseUrl}/api/audio-files?filters[errorId][$eq]=${errorId}&populate=*`
      );
      const data = await response.json();

      if (data.data && data.data.length > 0) {
        const audioUrl = `${this.strapiBaseUrl}${data.data[0].attributes.audio.data.attributes.url}`;
        return audioUrl;
      }
      return null;
    } catch (error) {
      console.error(`Failed to fetch audio for errorId ${errorId}:`, error);
      return null;
    }
  }

  // Load and cache audio file
  async loadAudio(phaseName) {
    if (this.audioCache.has(phaseName)) {
      return this.audioCache.get(phaseName);
    }

    const errorId = this.audioMapping[phaseName];
    if (!errorId) {
      console.warn(`No errorId mapping found for phase: ${phaseName}`);
      return null;
    }

    const audioUrl = await this.fetchAudioFromStrapi(errorId);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.preload = "auto";
      this.audioCache.set(phaseName, audio);
      return audio;
    }
    return null;
  }

  // Play audio for specific phase
  async playPhaseAudio(phaseName) {
    if (!this.isEnabled) return;

    try {
      let audio = this.audioCache.get(phaseName);

      if (!audio) {
        audio = await this.loadAudio(phaseName);
      }

      if (audio) {
        audio.currentTime = 0; // Reset to beginning
        await audio.play();
        console.log(`Playing audio for phase: ${phaseName}`);
      }
    } catch (error) {
      console.error(`Failed to play audio for ${phaseName}:`, error);
    }
  }

  // Preload all audio files
  async preloadAllAudio() {
    const loadPromises = Object.keys(this.audioMapping).map((phase) =>
      this.loadAudio(phase)
    );
    await Promise.all(loadPromises);
    console.log("All audio files preloaded");
  }

  // Toggle audio on/off
  toggleAudio() {
    this.isEnabled = !this.isEnabled;
    console.log(`Audio ${this.isEnabled ? "enabled" : "disabled"}`);
  }
}
