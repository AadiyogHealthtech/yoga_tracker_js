// Convert RepLogger from Python to JavaScript
import fs from 'fs/promises';
import path from 'path';

class RepLogger {
  constructor(outputDir = "logs", userId = "dummy_user") {
    this.outputDir = outputDir;
    this.userId = userId;
    this.date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    this.exerciseData = {}; // {exercise_id: [{"rep_id": int, "frames": []}]}
    
    // Create output directory if it doesn't exist
    fs.mkdir(this.outputDir, { recursive: true }).catch(err => {
      console.error(`Failed to create output directory: ${err}`);
    });
  }

  startRep(exerciseId) {
    /**
     * Initialize a new repetition entry for the given exercise.
     */
    if (!this.exerciseData[exerciseId]) {
      this.exerciseData[exerciseId] = [];
    }
    
    const repId = this.exerciseData[exerciseId].length + 1;
    this.exerciseData[exerciseId].push({
      "rep_id": repId,
      "frames": []
    });
    
    console.log(`Started logging for rep ${repId} of exercise ${exerciseId}`);
  }

  logFrame(exerciseId, frameData) {
    /**
     * Log frame details for the current repetition.
     */
    if (this.exerciseData[exerciseId] && this.exerciseData[exerciseId].length > 0) {
      const currentRep = this.exerciseData[exerciseId][this.exerciseData[exerciseId].length - 1];
      currentRep.frames.push(frameData);
    } else {
      console.warn(`No active repetition for exercise ${exerciseId} to log frame`);
    }
  }

  async saveToJson() {
    /**
     * Save the logged data to a JSON file.
     */
    const outputFile = path.join(this.outputDir, `reps_${this.userId}_${this.date}.json`);
    
    const data = {
      "user-id": this.userId,
      "date": this.date,
      "exercise_details": Object.entries(this.exerciseData).map(([exerciseId, reps]) => ({
        "id": exerciseId,
        "repetitions": reps.map(rep => ({
          "rep_id": rep.rep_id,
          "frames": rep.frames
        }))
      }))
    };
    
    try {
      await fs.writeFile(outputFile, JSON.stringify(data, null, 4));
      console.log(`Saved repetition data to ${outputFile}`);
    } catch (error) {
      console.error(`Failed to save repetition data: ${error}`);
    }
  }
}

// Example usage - equivalent to the Python __main__ block
async function main() {
  const logger = new RepLogger();
  logger.startRep("exercise-id-1");
  logger.logFrame("exercise-id-1", {"keypoints": [[0, 1, 2]], "phase": "start", "time": 1.0});
  logger.startRep("exercise-id-1");
  logger.logFrame("exercise-id-1", {"keypoints": [[3, 4, 5]], "phase": "holding", "time": 2.0});
  await logger.saveToJson();
}

// Run the example if this is the main module
if (require.main === module) {
  main().catch(err => console.error(err));
}

export default RepLogger;