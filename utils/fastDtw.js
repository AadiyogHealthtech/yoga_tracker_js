
function difference(a, b) {
    return Math.abs(a - b);
}

function norm(p) {
    return function(a, b) {
        const diff = Array.isArray(a) ? 
            a.map((val, i) => val - b[i]) : 
            [a - b];
        return Math.pow(diff.reduce((sum, val) => sum + Math.pow(Math.abs(val), p), 0), 1/p);
    };
}

export default function fastdtw(x, y, radius = 1, dist = null) {
    const [preparedX, preparedY, preparedDist] = prepInputs(x, y, dist);
    return fastdtwCore(preparedX, preparedY, radius, preparedDist);
}

function prepInputs(x, y, dist) {
    const xArr = Array.isArray(x) ? x : [x];
    const yArr = Array.isArray(y) ? y : [y];

    if (xArr.length > 1 && yArr.length > 1 && Array.isArray(xArr[0]) && Array.isArray(yArr[0]) && xArr[0].length !== yArr[0].length) {
        throw new Error('Second dimension of x and y must be the same');
    }
    
    if (typeof dist === 'number' && dist <= 0) {
        throw new Error('Distance metric must be positive');
    }

    let finalDist = dist;
    if (dist === null) {
        finalDist = (xArr.length === 1 || !Array.isArray(xArr[0])) ? difference : norm(2); // Use Euclidean for keypoints
    } else if (typeof dist === 'number') {
        finalDist = norm(dist);
    }

    return [xArr, yArr, finalDist];
}

function fastdtwCore(x, y, radius, dist) {
    const minTimeSize = radius + 2;

    if (x.length < minTimeSize || y.length < minTimeSize) {
        return dtw(x, y, dist);
    }

    const xShrinked = reduceByHalf(x);
    const yShrinked = reduceByHalf(y);
    
    const [distance, path] = fastdtwCore(xShrinked, yShrinked, radius, dist);
    const window = expandWindow(path, x.length, y.length, radius);
    
    return dtwCore(x, y, window, dist);
}

function dtw(x, y, dist = null) {
    const [preparedX, preparedY, preparedDist] = prepInputs(x, y, dist);
    return dtwCore(preparedX, preparedY, null, preparedDist);
}

function dtwCore(x, y, window, dist) {
    const lenX = x.length;
    const lenY = y.length;
    
    let fullWindow = window || [];
    if (!window) {
        for (let i = 0; i < lenX; i++) {
            for (let j = 0; j < lenY; j++) {
                fullWindow.push([i, j]);
            }
        }
    }

    const D = new Map();
    D.set('0,0', [0, 0, 0]);

    for (const [i, j] of fullWindow.map(([i, j]) => [i + 1, j + 1])) {
        const dt = dist(x[i-1], y[j-1]);
        if (isNaN(dt) || dt < 0) throw new Error(`Invalid distance at (i=${i-1}, j=${j-1}): ${dt}`);

        const options = [];
        
        // Check all three possible previous cells
        const prevCell1 = D.get(`${i-1},${j}`);
        const prevCell2 = D.get(`${i},${j-1}`);
        const prevCell3 = D.get(`${i-1},${j-1}`);
        
        if (prevCell1) options.push([prevCell1[0] + dt, i-1, j]);
        if (prevCell2) options.push([prevCell2[0] + dt, i, j-1]);
        if (prevCell3) options.push([prevCell3[0] + dt, i-1, j-1]);
        
        // If no valid previous cells, use infinity with default path
        if (options.length === 0) {
            if (i > 1 || j > 1) {
                console.warn(`No valid previous cells for (${i},${j}), using default path`);
            }
            options.push([i === 1 && j === 1 ? dt : Infinity, Math.max(0, i-1), Math.max(0, j-1)]);
        }
        
        D.set(`${i},${j}`, options.reduce((min, curr) => (curr[0] < min[0] ? curr : min)));
    }

    const path = [];
    let i = lenX;
    let j = lenY;
    
    // Reconstruct path
    const finalCell = D.get(`${i},${j}`);
    if (!finalCell) {
        console.error(`No final cell in D for (${i},${j})`);
        return [Infinity, []]; // Return empty path with Infinity distance
    }
    
    while (i > 0 || j > 0) {
        const current = D.get(`${i},${j}`);
        if (!current) {
            console.error(`No entry in D for (${i},${j})`);
            break; // Prevent infinite loop
        }
        path.push([i-1, j-1]);
        const [, nextI, nextJ] = current;
        i = nextI;
        j = nextJ;
    }
    
    path.reverse();
    const finalDistance = D.get(`${lenX},${lenY}`)?.[0] || Infinity;
    return [finalDistance, path];
}

function reduceByHalf(x) {
    const result = [];
    for (let i = 0; i < x.length - 1; i += 2) {
        if (Array.isArray(x[i])) {
            // Handle multi-dimensional data
            const nextIdx = Math.min(i+1, x.length-1);
            const avgPoint = x[i].map((val, idx) => {
                return Array.isArray(x[nextIdx]) ? (val + x[nextIdx][idx]) / 2 : val;
            });
            result.push(avgPoint);
        } else {
            // Handle scalar data
            const nextVal = (i+1 < x.length) ? x[i+1] : x[i];
            result.push((x[i] + nextVal) / 2);
        }
    }
    // If odd length, add the last element
    if (x.length % 2 !== 0) {
        result.push(x[x.length - 1]);
    }
    return result;
}

function expandWindow(path, lenX, lenY, radius) {
    const pathSet = new Set();
    
    // Add scaled coordinates to the set
    for (const [i, j] of path) {
        // Calculate scaling factors to map from reduced series to original series
        const scaleX = lenX / Math.max(1, path[path.length-1][0] + 1);
        const scaleY = lenY / Math.max(1, path[path.length-1][1] + 1);
        
        // Compute scaled coordinates in original space
        const scaledI = Math.min(Math.floor(i * scaleX), lenX - 1);
        const scaledJ = Math.min(Math.floor(j * scaleY), lenY - 1);
        
        // Add the point and its neighborhood to the window
        for (let a = -radius; a <= radius; a++) {
            for (let b = -radius; b <= radius; b++) {
                const newI = scaledI + a;
                const newJ = scaledJ + b;
                if (newI >= 0 && newJ >= 0 && newI < lenX && newJ < lenY) {
                    pathSet.add(`${newI},${newJ}`);
                }
            }
        }
    }

    // Convert set back to array of coordinate pairs
    const window = [];
    for (const coord of pathSet) {
        const [i, j] = coord.split(',').map(Number);
        window.push([i, j]);
    }
    
    // If window is empty, include some default points
    if (window.length === 0) {
        console.warn("Empty window after expansion, using default window");
        for (let i = 0; i < Math.min(radius * 2, lenX); i++) {
            for (let j = 0; j < Math.min(radius * 2, lenY); j++) {
                window.push([i, j]);
            }
        }
    }
    
    return window;
}