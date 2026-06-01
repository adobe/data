// © 2026 Adobe. MIT License. See /LICENSE for details.

import { generateBrdfLut } from "./brdf-lut.js";
import { generateEnvironment } from "./environment.js";
import { generateIrradiance } from "./irradiance.js";
import type { ParsedHdr } from "./parse-hdr.js";
import { generatePrefiltered } from "./prefilter.js";

export interface IblResources {
    environment: GPUTexture;
    irradiance: GPUTexture;
    prefiltered: GPUTexture;
    prefilteredMipCount: number;
    brdfLut: GPUTexture;
}

export interface IblOptions {
    environmentSize?: number;
    irradianceSize?: number;
    prefilteredSize?: number;
    prefilteredMipCount?: number;
    brdfLutSize?: number;
    /** Equirectangular HDR source. When omitted, a procedural studio is used. */
    hdrSource?: ParsedHdr;
}

/**
 * Computes the four IBL maps used by the prefiltered split-sum approximation:
 * source environment, diffuse irradiance, specular prefiltered (mip chain by
 * roughness), and the BRDF integration LUT. Everything runs in one command
 * buffer; the GPU sequences the dependencies internally.
 */
export function buildIblResources(device: GPUDevice, options: IblOptions = {}): IblResources {
    const envSize = options.environmentSize ?? 512;
    const irradianceSize = options.irradianceSize ?? 32;
    const prefilteredSize = options.prefilteredSize ?? 256;
    const prefilteredMipCount = options.prefilteredMipCount ?? 7;
    const brdfLutSize = options.brdfLutSize ?? 256;

    const encoder = device.createCommandEncoder({ label: "ibl-precompute" });
    const environment = generateEnvironment(device, encoder, envSize, options.hdrSource);
    const irradiance = generateIrradiance(device, encoder, environment, irradianceSize);
    const prefiltered = generatePrefiltered(device, encoder, environment, prefilteredSize, prefilteredMipCount);
    device.queue.submit([encoder.finish()]);

    const brdfEncoder = device.createCommandEncoder({ label: "ibl-brdf-lut" });
    const brdfLut = generateBrdfLut(device, brdfEncoder, brdfLutSize);
    device.queue.submit([brdfEncoder.finish()]);

    return {
        environment,
        irradiance,
        prefiltered: prefiltered.texture,
        prefilteredMipCount: prefiltered.mipLevelCount,
        brdfLut,
    };
}
