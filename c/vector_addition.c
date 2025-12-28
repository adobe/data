/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 * Copyright 2025 Adobe
 * All Rights Reserved.
 *
 * NOTICE: All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 **************************************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <arm_neon.h>
#include <time.h>

/*
 * Optimization Note:
 * Treating data as Array of Structures (AoS) - {x,y,z}, {x,y,z}...
 * usually incurs a penalty compared to Structure of Arrays (SoA) - {x,x...}, {y,y...}.
 * However, using NEON's `vld3q` / `vst3q` allows us to de-interleave on load
 * and re-interleave on store effectively, mitigating the AoS penalty.
 */

typedef struct
{
    float x, y, z;
} Vector3;

#define ARRAY_SIZE 250000
#define NUM_RUNS 500 // Increased runs for more stable benchmarking
#define ALIGNMENT 16 // 128-bit alignment

// High precision timer
double get_time()
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC_RAW, &ts);
    return ts.tv_sec + ts.tv_nsec * 1e-9;
}

/**
 * Adds two arrays of Vector3 using NEON intrinsics.
 * Uses vld3q/vst3q to handle the Interleaved (AoS) data layout.
 */
void add_vectors_neon(const Vector3 *restrict a, const Vector3 *restrict b, Vector3 *restrict result, int size)
{
    // Ensure we process 4 vectors per iteration
    int i = 0;
    for (; i <= size - 4; i += 4)
    {
        // Load 3-element structures de-interleaved into 3 registers (x, y, z)
        // input: x0 y0 z0 x1 y1 z1 ...
        // va.val[0] = {x0, x1, x2, x3}
        // va.val[1] = {y0, y1, y2, y3}
        // va.val[2] = {z0, z1, z2, z3}
        float32x4x3_t va = vld3q_f32((const float *)&a[i]);
        float32x4x3_t vb = vld3q_f32((const float *)&b[i]);
        float32x4x3_t vres;

        // Vectorized Addition
        vres.val[0] = vaddq_f32(va.val[0], vb.val[0]);
        vres.val[1] = vaddq_f32(va.val[1], vb.val[1]);
        vres.val[2] = vaddq_f32(va.val[2], vb.val[2]);

        // Interleave and store back to memory
        vst3q_f32((float *)&result[i], vres);
    }

    // Handle remainder (tail cleanup) if size is not divisible by 4
    for (; i < size; i++)
    {
        result[i].x = a[i].x + b[i].x;
        result[i].y = a[i].y + b[i].y;
        result[i].z = a[i].z + b[i].z;
    }
}

int main()
{
    size_t data_size = ARRAY_SIZE * sizeof(Vector3);

    // Using aligned_alloc for SIMD friendliness, though vld3 handles unaligned well on modern ARM
    Vector3 *a = (Vector3 *)aligned_alloc(ALIGNMENT, data_size);
    Vector3 *b = (Vector3 *)aligned_alloc(ALIGNMENT, data_size);
    Vector3 *result = (Vector3 *)aligned_alloc(ALIGNMENT, data_size);

    if (!a || !b || !result) {
        fprintf(stderr, "Memory allocation failed\n");
        return 1;
    }

    // Initialize data
    for (int i = 0; i < ARRAY_SIZE; i++)
    {
        float f = (float)i;
        a[i] = (Vector3){f * 0.1f, f * 0.2f, f * 0.3f};
        b[i] = (Vector3){f * 0.4f, f * 0.5f, f * 0.6f};
    }

    // Sink to prevent optimization
    volatile float sink = 0.0f;

    printf("Benchmarking Vector3 Addition (NEON Optimized)...\n");
    printf("Array Size: %d | Runs: %d\n", ARRAY_SIZE, NUM_RUNS);

    double start_time = get_time();

    for (int run = 0; run < NUM_RUNS; run++)
    {
        add_vectors_neon(a, b, result, ARRAY_SIZE);

        // Simple aggregation to prevent dead code elimination
        // Only checking the first element to minimize overhead inside the benchmark loop
        sink += result[0].x; 
    }

    double end_time = get_time();
    double total_time = end_time - start_time;
    double average_time = total_time / NUM_RUNS;

    // FLOP Calculation: 3 additions per Vector3 (x+x, y+y, z+z)
    double ops_per_run = 3.0 * ARRAY_SIZE; 
    double total_flops = ops_per_run * NUM_RUNS;
    double mflops = (total_flops / total_time) / 1e6;

    printf("------------------------------------------------\n");
    printf("Total Time   : %f seconds\n", total_time);
    printf("Avg Time/Run : %f seconds\n", average_time);
    printf("Throughput   : %.2f MFLOPS\n", mflops);
    printf("Sink Value   : %f\n", sink); // Verification

    free(a);
    free(b);
    free(result);

    return 0;
}