import { uniform } from "three/tsl";

/**
 * Simulation time in seconds as a shader uniform. Advanced only by the fixed
 * step in `CityWorld.tick`, so pausing (hidden tab, reduced motion) also
 * freezes shader animation instead of letting it jump on the next render.
 */
export const simClock = uniform(0);
