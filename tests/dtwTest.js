
import { calculateDtwScore } from '../utils/utils.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Hello from DtwTest initial");

async function loadKeypoints(jsonPath) {
    try {
        const absolutePath = path.resolve(__dirname, '..', jsonPath);
        console.log("Loading from absolute path:", absolutePath);
        
        const data = await readFile(absolutePath, 'utf8');
        const parsed = JSON.parse(data);
        
        // Handle different possible JSON structures
        if (Array.isArray(parsed)) {
            console.log(`Loaded ${parsed.length} keypoints from ${jsonPath}`);
            // Convert to array of [x,y,z] format if needed
            if (parsed.length > 0 && typeof parsed[0] === 'object' && 'x' in parsed[0]) {
                return parsed.map(p => [p.x, p.y, p.z || 0]);
            }
            return parsed;
        } else {
            console.log(`Loaded data from ${jsonPath}, not an array. Structure:`, 
                Object.keys(parsed).join(', '));
            // Try to extract keypoints from known structure formats
            if (parsed.keypoints) return parsed.keypoints;
            if (parsed.landmarks) return parsed.landmarks;
            return parsed; // Return as-is if no known structure
        }
    } catch (error) {
        console.error(`Error loading keypoints from ${jsonPath}:`, error);
        throw error;
    }
}

export async function testFastdtwKeypoints() {
    const jsonPath1 = "assets/image_man_hold.json";
    const jsonPath2 = "assets/image_woman_hold.json";

    try {
        // Load and process keypoints
        const keypoints1 = await loadKeypoints(jsonPath1);
        const keypoints2 = await loadKeypoints(jsonPath2);
        
        if (!Array.isArray(keypoints1) || !Array.isArray(keypoints2)) {
            throw new Error("Loaded data is not in array format");
        }
        
        // Show samples for verification
        console.log("Sample from keypoints1:", keypoints1.slice(0, 2));
        console.log("Sample from keypoints2:", keypoints2.slice(0, 2));
        
        // Test with simple data to verify algorithm works
        console.log("\n--- Testing simple data ---");
        const simpleResult = calculateDtwScore([1, 3, 4], [2, 4, 5]);
        console.log("Simple DTW result:", simpleResult);
        
        // Test with real data
        console.log("\n--- Testing with actual keypoints ---");
        const result = calculateDtwScore(keypoints1, keypoints2);
        const kpt1 = calculateDtwScore([keypoints1[1]], [keypoints2[1]]);
        const {dtwDistance: point1dtw, path: point1path} = kpt1;
        console.log("first dtw is ", point1dtw);




        if (result === null) {
            throw new Error("DTW calculation failed");
        }
        
        const { dtwDistance, path } = result;
        console.log("FastDTW Distance:", dtwDistance);
        console.log("Path length:", path ? path.length : 0);
        
        // If you want to test just hand points
        if (keypoints1[15] && keypoints2[15]) {
            console.log("\n--- Testing with just hand points ---");
            const hand1 = keypoints1[15];
            const hand2 = keypoints2[15];
            console.log("Hand 1:", hand1);
            console.log("Hand 2:", hand2);
            
            const handResult = calculateDtwScore([hand1], [hand2]);
            if (handResult) {
                console.log("Hand DTW distance:", handResult.dtwDistance);
            } else {
                console.log("Hand DTW calculation failed");
            }
        }
        
    } catch (error) {
        console.error("Error in testFastdtwKeypoints:", error);
    }
}

// Run the test
testFastdtwKeypoints();