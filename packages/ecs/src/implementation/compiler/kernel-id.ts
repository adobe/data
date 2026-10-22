/// <reference types="node" />
import { createHash } from 'node:crypto';

const servePrefix = "/@ecs-kernel/";
const buildPrefix = "\0ecs-kernel:";

/** `hash` is set for serve urls: the version of the kernel the description was compiled against. */
export type KernelId = { readonly parent: string; readonly index: number; readonly hash: string | undefined };

const encode = (parent: string, index: number): string => `${Buffer.from(parent).toString("base64url")}/${index}.js`;

/** A short hash of a kernel's identity (its description and module source). */
export const kernelHash = (identity: string): string => createHash("sha256").update(identity).digest("base64url").slice(0, 10);

/**
 * The root-absolute url of a kernel module on the dev server, which a page and its module workers import from it. The
 * hash makes an edited kernel a new module, and lets `load` reject a stale url.
 */
export const serveUrl = (parent: string, index: number, hash: string): string => `${servePrefix}${encode(parent, index)}?h=${hash}`;

/** The virtual id of a kernel module emitted as a chunk in a build. */
export const buildId = (parent: string, index: number): string => `${buildPrefix}${encode(parent, index)}`;

/** Parses a serve url or build id. */
export const parseKernelId = (id: string): KernelId | undefined => {
    const prefix = id.startsWith(servePrefix) ? servePrefix : id.startsWith(buildPrefix) ? buildPrefix : undefined;
    if (prefix === undefined) return undefined;
    const [path = "", query = ""] = id.slice(prefix.length).split("?");
    const match = /^([\w-]+)\/(\d+)\.js$/.exec(path);
    if (match === null) return undefined;
    const hash = new URLSearchParams(query).get("h") ?? undefined;
    return { parent: Buffer.from(match[1] ?? "", "base64url").toString(), index: Number(match[2]), hash };
};
