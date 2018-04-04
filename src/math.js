import {vec3} from 'gl-matrix';

/**
 * Find barycentric coordinates
 *
 * @see https://gamedev.stackexchange.com/questions/23743/whats-the-most-efficient-way-to-find-barycentric-coordinates
 *
 * @param {vec3} p
 * @param {vec3} a first point of triangle
 * @param {vec3} b second point of triangle
 * @param {vec3} c third point of triangle
 *
 * @return {vec3}
 */
export function barycentric (p, a, b, c) {
    let v0 = vec3.subtract(vec3.create(), b, a),
        v1 = vec3.subtract(vec3.create(), c, a),
        v2 = vec3.subtract(vec3.create(), p, a),
        d00 = vec3.dot(v0, v0),
        d01 = vec3.dot(v0, v1),
        d11 = vec3.dot(v1, v1),
        d20 = vec3.dot(v2, v0),
        d21 = vec3.dot(v2, v1),
        denom = d00 * d11 - d01 * d01;

    let v = (d11 * d20 - d01 * d21) / denom;
    let w = (d00 * d21 - d01 * d20) / denom;
    let u = 1.0 - v - w;

    return vec3.fromValues(u, v, w);
}

/**
 * Interpolates vertex attributes over a triangle
 *
 * @param {vec3} out interpolation result
 * @param {vec3} p point to interpolate to
 * @param {vec3} a first point of triangle
 * @param {vec3} b second point of triangle
 * @param {vec3} c third point of triangle
 * @param {Array<vec3>} attrs attributes to interpolate
 */
export function interpolate (out, p, a, b, c, attrs) {
    let bary = barycentric(p, a, b, c),
        tmp = vec3.create();

    vec3.scale(out, attrs[0], bary[0]);
    vec3.add(out, out, vec3.scale(tmp, attrs[1], bary[1]));
    vec3.add(out, out, vec3.scale(tmp, attrs[2], bary[2]));
}

/**
 * Find barycentric coordinates
 *
 * @see https://answers.unity.com/questions/383804/calculate-uv-coordinates-of-3d-point-on-plane-of-m.html
 *
 * @param {vec3} f
 * @param {vec3} p1 first point of triangle
 * @param {vec3} p2 second point of triangle
 * @param {vec3} p3 third point of triangle
 *
 * @return {vec3}
 */
export function barycentric2 (f, p1, p2, p3) {
    let f1 = vec3.subtract([], p1, f),
        f2 = vec3.subtract([], p2, f),
        f3 = vec3.subtract([], p3, f),
        p1p2 = vec3.subtract([], p1, p2),
        p1p3 = vec3.subtract([], p1, p3),
        va = vec3.cross([], p1p2, p1p3),

        va1 = vec3.cross([], f2, f3),
        va2 = vec3.cross([], f3, f1),
        va3 = vec3.cross([], f1, f2),

        a = 1 / vec3.length(va),
        d1 = vec3.dot(va, va1),
        d2 = vec3.dot(va, va2),
        d3 = vec3.dot(va, va3),
        s1 = d1 < 0 ? -1 : 1,
        s2 = d2 < 0 ? -1 : 1,
        s3 = d3 < 0 ? -1 : 1,
        a1 = vec3.length(va1) * a * s1,
        a2 = vec3.length(va2) * a * s2,
        a3 = vec3.length(va3) * a * s3;

    return vec3.fromValues(a1, a2, a3);
}
