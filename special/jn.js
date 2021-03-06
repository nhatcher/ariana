
// https://github.com/JuliaLang/openlibm/blob/master/src/e_jn.c

/*
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice 
 * is preserved.
 * ====================================================
 */

/*
 * __ieee754_jn(n, x), __ieee754_yn(n, x)
 * floating point Bessel's function of the 1st and 2nd kind
 * of order n
 *          
 * Special cases:
 *	y0(0)=y1(0)=yn(n,0) = -inf with division by 0 signal;
 *	y0(-ve)=y1(-ve)=yn(n,-ve) are NaN with invalid signal.
 * Note 2. About jn(n,x), yn(n,x)
 *	For n=0, j0(x) is called,
 *	for n=1, j1(x) is called,
 *	for n<x, forward recursion us used starting
 *	from values of j0(x) and j1(x).
 *	for n>x, a continued fraction approximation to
 *	j(n,x)/j(n-1,x) is evaluated and then backward
 *	recursion is used starting from a supposed value
 *	for j(n,x). The resulting value of j(0,x) is
 *	compared with the actual value to correct the
 *	supposed value of j(n,x).
 *
 *	yn(n,x) is similar in all respects, except
 *	that forward recursion is used for all
 *	values of n>1.
 *	
 */

(function() {
	const invsqrtpi =  5.64189583547756279280e-01; /* 0x3FE20DD7, 0x50429B6D */

	const j0 = math.j0,
		  j1 = math.j1,
		  y0 = math.y0,
		  y1 = math.y1;
		  
	const abs = Math.abs,
		cos = Math.cos,
		sin = Math.sin,
		log = Math.log,
		sqrt = Math.sqrt;

	function jn(n, x) {
		let i, hx, ix, lx, sgn;
		let a, b, temp, di;
		let z, w;
	
		/* J(-n,x) = (-1)^n * J(n, x), J(n, -x) = (-1)^n * J(n, x)
		 * Thus, J(-n,x) = J(n,-x)
		 */
		lx = bin_utils.lowWord(x);
		hx = bin_utils.highWord(x);
		ix = 0x7fffffff&hx;
		/* if J(n,NaN) is NaN */
		if ((ix | (/*(u_int32_t)*/(lx|-lx))>>31)>0x7ff00000) {
			return x+x;
		}
		if (n<0) {		
			n = -n;
			x = -x;
			hx ^= 0x80000000;
		}
		if(n === 0) {
			return j0(x);
		}
		if(n === 1) {
			return j1(x);
		}
		sgn = (n&1)&(hx>>31);	/* even n -- 0, odd n -- sign(x) */
		x = abs(x);
		if((ix|lx)==0||ix>=0x7ff00000) { 	/* if x is 0 or inf */
			b = 0;
		} else if (n<=x) {   
			/* Safe to use J(n+1,x)=2n/x *J(n,x)-J(n-1,x) */
			if(ix>=0x52D00000) { /* x > 2**302 */
				/* (x >> n**2) 
				*	    Jn(x) = cos(x-(2n+1)*pi/4)*sqrt(2/x*pi)
				*	    Yn(x) = sin(x-(2n+1)*pi/4)*sqrt(2/x*pi)
				*	    Let s=sin(x), c=cos(x), 
				*		xn=x-(2n+1)*pi/4, sqt2 = sqrt(2),then
				*
				*		   n	sin(xn)*sqt2	cos(xn)*sqt2
				*		----------------------------------
				*		   0	 s-c		 c+s
				*		   1	-s-c 		-c+s
				*		   2	-s+c		-c-s
				*		   3	 s+c		 c-s
				*/
				switch(n&3) {
					case 0: temp =  cos(x)+sin(x); break;
					case 1: temp = -cos(x)+sin(x); break;
					case 2: temp = -cos(x)-sin(x); break;
					case 3: temp =  cos(x)-sin(x); break;
				}
				b = invsqrtpi*temp/sqrt(x);
			} else {	
				a = j0(x);
				b = j1(x);
				for(i=1;i<n;i++){
				temp = b;
				b = b*((i+i)/x) - a; /* avoid underflow */
				a = temp;
				}
			}
		} else {
			if(ix<0x3e100000) {	/* x < 2**-29 */
				/* x is tiny, return the first Taylor expansion of J(n,x) 
				* J(n,x) = 1/n!*(x/2)^n  - ...
				*/
				if(n>33) {	/* underflow */
					b = 0;
				} else {
					temp = x*0.5;
					b = temp;
					for (a=1, i=2; i<=n; i++) {
						a *= i;		/* a = n! */
						b *= temp;  /* b = (x/2)^n */
					}
					b = b/a;
				}
			} else {
			/* use backward recurrence */
			/* 			x      x^2      x^2       
			 *  J(n,x)/J(n-1,x) =  ----   ------   ------   .....
			 *			2n  - 2(n+1) - 2(n+2)
			 *
			 * 			1      1        1       
			 *  (for large x)   =  ----  ------   ------   .....
			 *			2n   2(n+1)   2(n+2)
			 *			-- - ------ - ------ - 
			 *			 x     x         x
			 *
			 * Let w = 2n/x and h=2/x, then the above quotient
			 * is equal to the continued fraction:
			 *		    1
			 *	= -----------------------
			 *		       1
			 *	   w - -----------------
			 *			  1
			 * 	        w+h - ---------
			 *		       w+2h - ...
			 *
			 * To determine how many terms needed, let
			 * Q(0) = w, Q(1) = w(w+h) - 1,
			 * Q(k) = (w+k*h)*Q(k-1) - Q(k-2),
			 * When Q(k) > 1e4	good for single 
			 * When Q(k) > 1e9	good for double 
			 * When Q(k) > 1e17	good for quadruple 
			 */
			/* determine k */
			let /*double*/ t, v;
			let /*double*/ q0, q1, h, tmp; 
			let /*int32_t*/ k, m;
			w = (n+n)/x; 
			h = 2/x;
			q0 = w;
			z = w + h;
			q1 = w*z - 1.0;
			k = 1;
			while (q1<1.0e9) {
				k += 1; z += h;
				tmp = z*q1 - q0;
				q0 = q1;
				q1 = tmp;
			}
			m = n+n;
			for (t=0, i = 2*(n+k); i>=m; i -= 2) t = 1/(i/x-t);
			a = t;
			b = 1;
			/*  estimate log((2/x)^n*n!) = n*log(2/x)+n*ln(n)
			 *  Hence, if n*(log(2n/x)) > ...
			 *  single 8.8722839355e+01
			 *  double 7.09782712893383973096e+02
			 *  long double 1.1356523406294143949491931077970765006170e+04
			 *  then recurrent value may overflow and the result is
			 *  likely underflow to 0
			 */
			tmp = n;
			v = 2/x;
			tmp = tmp*log(abs(v*tmp));
			if(tmp<7.09782712893383973096e+02) {
				for(i=n-1, di=(i+i); i>0; i--){
					temp = b;
					b *= di;
					b  = b/x - a;
					a = temp;
					di -= 2;
				 }
			} else {
				for(i=n-1, di=(i+i); i>0; i--) {
					temp = b;
					b *= di;
					b  = b/x - a;
					a = temp;
					di -= 2;
					/* scale b to avoid spurious overflow */
					if (b>1e100) {
						a /= b;
						t /= b;
						b  = 1;
					}
				}
			}
			z = j0(x);
			w = j1(x);
			if (abs(z) >= abs(w)) {
				b = (t*z/b);
			} else {
				b = (t*w/a);
			}
		}
	}
	if (sgn === 1) {
		return -b;
	} else {
		return b;
	}
}
	
	function yn(/*int*/n, /*double*/ x) {
		let /*int32_t*/ i, hx, ix, lx;
		let /*int32_t*/ sign;
		let /*double*/ a, b, temp;
	
		lx = bin_utils.lowWord(x);
		hx = bin_utils.highWord(x);
		ix = 0x7fffffff&hx;
		/* if Y(n,NaN) is NaN */
		if ((ix|(/*(u_int32_t)*/(lx|-lx))>>31)>0x7ff00000) {
			return x+x;
		}
		if ((ix|lx)==0) {
			return -Infinity;
		}
		if (hx<0) {
			return NaN;
		}
		sign = 1;
		if (n<0) {
			n = -n;
			sign = 1 - ((n&1)<<1);
		}
		if (n === 0) {
			return y0(x);
		}
		if (n === 1) {
			return sign*y1(x);
		}
		if (ix === 0x7ff00000) {
			return 0;
		}
		if (ix>=0x52D00000) { /* x > 2**302 */
			/* (x >> n**2) 
			*	    Jn(x) = cos(x-(2n+1)*pi/4)*sqrt(2/x*pi)
			*	    Yn(x) = sin(x-(2n+1)*pi/4)*sqrt(2/x*pi)
			*	    Let s=sin(x), c=cos(x), 
			*		xn=x-(2n+1)*pi/4, sqt2 = sqrt(2),then
			*
			*		   n	sin(xn)*sqt2	cos(xn)*sqt2
			*		----------------------------------
			*		   0	 s-c		 c+s
			*		   1	-s-c 		-c+s
			*		   2	-s+c		-c-s
			*		   3	 s+c		 c-s
			*/
			switch(n&3) {
				case 0: temp =  sin(x)-cos(x); break;
				case 1: temp = -sin(x)-cos(x); break;
				case 2: temp = -sin(x)+cos(x); break;
				case 3: temp =  sin(x)+cos(x); break;
			}
			b = invsqrtpi*temp/sqrt(x);
		} else {
			let /*u_int32_t*/ high;
			a = y0(x);
			b = y1(x);
			/* quit if b is -inf */
			high = bin_utils.highWord(b);
			for (i=1; i<n && high!=0xfff00000; i++) {
				temp = b;
				b = ((i+i)/x)*b - a;
				high = bin_utils.highWord(b);
				a = temp;
			}
		}
		if (sign>0) {
			return b;
		} else {
			return -b;
		}
	}

	math.jn = jn;
	math.yn = yn;

})();

