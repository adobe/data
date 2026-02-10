
# Performance Findings

## Tests

- Create 1 million particles
    - Particles have
        - color: u32
        - mass: f32
        - position: f32
        - velocity: f32
        - visible?: true
        - enabled?: true
    - 50Mb Expected memory size assuming 16 byte overhead per Particle
    - 1/4 of particles enabled and visible
    - 1/4 of particles enabled
    - 1/4 of particles visible
    - 1/4 of particles neither
- Process All visible and enabled particles
    - add velocity to position for each
    - test with freshly allocated linear memory (best) and shuffled (worst)

## Techniques Tested

- Plain old Javascript Objects (POJO)
- Immutable Javascript Objects (IJO)
- Mobx Observable Javascript Objects (MOBX)
- Horizon Emulated Storage (HORIZON*)
- Entity Component System (ECS)

## Results

              Create      Create      Process     Process     Notes
              Memory      Time        Best        Worst

    POJO      248 mb       124 ms     145 ms      363 ms
    POJO M1   248 mb        62 ms      58 ms      302 ms      memory is way more efficient on M1
    IJO       248 mb       124 ms     656 ms      844 ms      much memory allocation on process 
    MOBX      994 mb      1600 ms     160 ms      437 ms      some memory allocation on process *
    HORIZON*  991 mb      1650 ms    1214 ms     2415 ms      much memory allocation on process
    ECS        59 mb       410 ms      15 ms       15 ms
    ECS M1     59 mb       410 ms      10 ms       10 ms      memory was already efficient before
    ECS M1 WASM            410 ms       4 ms        4 ms      compiler simd ops #add_arrays
    ECS M1 WASM SIMD       410 ms       3 ms        3 ms      manual simd ops #add_arrays_simd

    RUST OPTIMIZED COMMAND LINE      0.15 ms     0.15 ms      raw processing of minimum memory
    THEORETICAL M1 MAX               0.12 ms     0.12 ms      single core execution, no gpu

## Findings / Reasons

- Plain Javascript Objects are the fastest to create.
    - highly optimized in V8
- Immutable Javascript Objects are the slowest to process.
    - new allocation slower than mutate in place
- Mobx is the slowest to create by an order of magnitude.
    - likely due to Proxy creation
- Mobx uses the most memory by a factor of 20.
    - likely due to Proxy creation
- Horizon* was emulated using UUIDV4 and Map of Maps with immutable components.
    - This is consistent with very best possible case horizon performance.
    - Horizon ECS does allow us to only process the 1/4 that are visible + enabled.
- ECS is the most efficient in memory by a factor of 5
    - ECS is storing in f32 and others storing large numbers in f64
    - ECS is not allocating per entity for enabled/visible flags.
- ECS is the most efficient in processing by a factor of 10
    - All enabled/visible particle components are allocated adjacently for optimal cache behavior
- M1 chip seems to have three times faster memory bandwidth, tripling best case speed.
- M1 chip cache misses are still expensive which is likely why worst case only a bit better.
- Rust to Wasm compiler can automatically insert SIMD instructions.
- Explicit SIMD instructions are a bit faster.
- Maximum theoretical performance from optimized rust command line is about 20 times faster than our best.


## Summary

- ECS trades extra time at creation for significant improvements to memory usage and processing performance.

## Notes

- Plain javascript object memory size per property depends upon number value used. For small integers, it seems a 32 bit format is used, but for larger floating point values a 64 bit is used.
- If you run the tests with only small integer values then the memory results are almost half the size.
- Prompt to ask Chat GPT 4 maximum theoretical performance:

    theoretical performance question. How fast should a Macbook Pro M1 2021 be able to perform the following processing:

    given 12MB of f32 array data split into two arrays. How fast can it add each float to the corresponding float in the second array and write the result to the second array?
- Answer
    Assuming only one core is used, the theoretical peak performance for this simple operation could be 3 GHz * 8 floats/cycle = 24 billion floats/second.

    or 0.125 ms