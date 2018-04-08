/**
 * @module quadric
 *
 * @see https://github.com/sp4cerat/Fast-Quadric-Mesh-Simplification
 *
 * @see https://gist.github.com/zz85/a317597912d68cf046558006d7647381
 */

import {vec3} from 'gl-matrix';

export class Quadric {

    static fromPoints (p1, p2, p3) {
        let p1p3 = vec3.subtract(vec3.create(), p2, p1),
            p2p3 = vec3.subtract(vec3.create(), p3, p1),
            n = vec3.cross(vec3.create(), p1p3, p2p3),
            q = new Quadric();
        vec3.normalize(n, n);
        q.makePlane(n[0], n[1], n[2], -vec3.dot(n, p1));
        return q;
    }

    constructor () {
        this.m = new Float32Array(10);
        this.setZero();
    }

    setZero () {
        for (let i = 0; i < 10; ++i) this.m[i] = 0;
    }

    set( m11, m12, m13, m14, m22, m23, m24, m33, m34, m44 ) {
		this.m[0] = m11;
		this.m[1] = m12;
		this.m[2] = m13;
		this.m[3] = m14;
		this.m[4] = m22;
		this.m[5] = m23;
		this.m[6] = m24;
		this.m[7] = m33;
		this.m[8] = m34;
		this.m[9] = m44;
		return this;
    }

    makePlane( a, b, c, d ) {
		return this.set(
			a * a, a * b, a * c, a * d,
			       b * b, b * c, b * d,
			              c * c, c * d,
			                     d * d
		);
	}

    det( a11, a12, a13, a21, a22, a23, a31, a32, a33 ) {

		let det =

              this.m[ a11 ] * this.m[ a22 ] * this.m[ a33 ]

        	+ this.m[ a13 ] * this.m[ a21 ] * this.m[ a32 ]

        	+ this.m[ a12 ] * this.m[ a23 ] * this.m[ a31 ]

        	- this.m[ a13 ] * this.m[ a22 ] * this.m[ a31 ]

        	- this.m[ a11 ] * this.m[ a23 ] * this.m[ a32 ]

        	- this.m[ a12 ] * this.m[ a21 ] * this.m[ a33 ];

        return det;
	}

    add (n) {
        return new Quadric().set(
			this.m[0] + n.m[0],
			this.m[1] + n.m[1],
			this.m[2] + n.m[2],
			this.m[3] + n.m[3],
			this.m[4] + n.m[4],
			this.m[5] + n.m[5],
			this.m[6] + n.m[6],
			this.m[7] + n.m[7],
			this.m[8] + n.m[8],
			this.m[9] + n.m[9]
		);
    }

    addSelf (n) {
        this.m[0]+=n.m[0];   this.m[1]+=n.m[1];   this.m[2]+=n.m[2];   this.m[3]+=n.m[3];
		this.m[4]+=n.m[4];   this.m[5]+=n.m[5];   this.m[6]+=n.m[6];   this.m[7]+=n.m[7];
		this.m[8]+=n.m[8];   this.m[9]+=n.m[9]
    }

    /**
     * Evaluates a vec3
     *
     * @param {vec3} v
     *
     * @return {Number}
     */
    evaluate (v) {
        let {m} = this,
            [x, y, z] = v;
        return m[0]*x*x + 2*m[1]*x*y + 2*m[2]*x*z + 2*m[3]*x + m[4]*y*y
            + 2*m[5]*y*z + 2*m[6]*y + m[7]*z*z + 2*m[8]*z + m[9];
    }

    /**
     * Finds optimal point
     *
     * @return {vec3} or `null` when not found
     */
    optimize () {
        let det = this.det(0, 1, 2, 1, 4, 5, 2, 5, 7);
        if (Math.abs(det) < 1e-12) return null;
        let p = new Float32Array(3);
        p[0] = -1/det*(this.det(1, 2, 3, 4, 5, 6, 5, 7 , 8));
        p[1] =  1/det*(this.det(0, 2, 3, 1, 5, 6, 2, 7 , 8));
        p[2] = -1/det*(this.det(0, 1, 3, 1, 4, 6, 2, 5,  8));
        return p;
    }
}
