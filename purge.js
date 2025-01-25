/*
Initial implementation extracted from https://github.com/bambulab/BambuStudio/blob/5b834000f684368e094e9d677a0d24dc298750a5/src/libslic3r/FlushVolCalc.cpp
and modified to produce good starting values for Prusa MMU.
*/

const min_purge_vol = 65;
const max_purge_vol = 800;
const extra_purge_vol = 60;

let pickers = {};

function hex_rgb(args) {
	const match = args.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i);
	if (!match) {
		return [0, 0, 0];
	}

	let colorString = match[0];

	if (match[0].length === 3) {
		colorString = colorString.split('').map(char => {
			return char + char;
		}).join('');
	}

	const integer = parseInt(colorString, 16);
	const r = (integer >> 16) & 0xFF;
	const g = (integer >> 8) & 0xFF;
	const b = integer & 0xFF;

	return [r, g, b];
};

function rgb_hsv(rgb) {
	let rdif;
	let gdif;
	let bdif;
	let h;
	let s;

	const r = rgb[0] / 255;
	const g = rgb[1] / 255;
	const b = rgb[2] / 255;
	const v = Math.max(r, g, b);
	const diff = v - Math.min(r, g, b);
	const diffc = function (c) {
		return (v - c) / 6 / diff + 1 / 2;
	};

	if (diff === 0) {
		h = 0;
		s = 0;
	} else {
		s = diff / v;
		rdif = diffc(r);
		gdif = diffc(g);
		bdif = diffc(b);

		if (r === v) {
			h = bdif - gdif;
		} else if (g === v) {
			h = (1 / 3) + rdif - bdif;
		} else if (b === v) {
			h = (2 / 3) + gdif - rdif;
		}

		if (h < 0) {
			h += 1;
		} else if (h > 1) {
			h -= 1;
		}
	}
	return [h * 360, s, v];
}

function calc_triangle_3rd_edge(edge_a, edge_b, degree_ab) {
    let rad = to_radians(degree_ab);
    return Math.sqrt(edge_a * edge_a + edge_b * edge_b - 2 * edge_a * edge_b * Math.cos(rad));
}

function to_radians(degree) {
    return degree * (Math.PI / 180);
}

function get_luminance(rgb) {
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    return r * 0.3 + g * 0.59 + b * 0.11;
}

function delta_hs(src, dst) {
    const [h1, s1, v1] = src;
    const [h2, s2, v2] = dst;
    h1_rad = to_radians(h1);
    h2_rad = to_radians(h2);
    dx = Math.cos(h1_rad) * s1 * v1 - Math.cos(h2_rad) * s2 * v2;
    dy = Math.sin(h1_rad) * s1 * v1 - Math.sin(h2_rad) * s2 * v2;
    dxy = Math.sqrt(dx * dx + dy * dy);
    return Math.min(1.2, dxy);
}

function calc_purge_volume(src_hex, dst_hex, multiplier) {
    const src_rgb = hex_rgb(src_hex);
    const dst_rgb = hex_rgb(dst_hex);
    const src_hsv = rgb_hsv(src_rgb);
    const dst_hsv = rgb_hsv(dst_rgb);
    let hs_dist = delta_hs(src_hsv, dst_hsv);

    let src_lum = get_luminance(src_rgb);
    let dst_lum = get_luminance(dst_rgb);
    let lum_purge;
    if (dst_lum >= src_lum) {
        lum_purge = Math.pow(dst_lum - src_lum, 0.7) * 339;
    } else {
        const src_hsv_v = src_hsv[2];
        const dst_hsv_v = dst_hsv[2];
        const inter_hsv_v = 0.67 * dst_hsv_v + 0.33 * src_hsv_v;
        lum_purge = (src_lum - dst_lum) * 63;
        hs_dist = Math.min(inter_hsv_v, hs_dist);
    }
    let hs_purge = 137 * hs_dist;
    let purge_volume = calc_triangle_3rd_edge(hs_purge, lum_purge, 120);
    purge_volume *= multiplier;
    purge_volume = Math.max(purge_volume, min_purge_vol);
    // purge_volume += extra_purge_vol;
    return Math.trunc(Math.min(purge_volume, max_purge_vol));
}

function update(src, dst, val) {
    let td = document.querySelector("td#" + src + dst);
    if (src == dst) {
        td.innerHTML = "-";
        return;
    }
    td.innerHTML = val;
}

function recalculate() {
    let multiplier = document.querySelector("input#multiplier").value;
    const keys = Object.keys(pickers);
    let count = 1;
    keys.forEach((src) => {
        let others = keys.filter(function(key) {
            return key !== src;
        });
        others.forEach((dst) => {
            purge = calc_purge_volume(pickers[src].value, pickers[dst].value, multiplier);
            update(src, dst, purge);
        });
        // update colour boxes
        let value = pickers[src].value;
        document.getElementById("to" + count).style.backgroundColor = value;
        document.getElementById("from" + count).style.backgroundColor = value;
        count++;
    });
}

function initialColour(picker) {
    val = picker.id.substring(1) - 1;
    initials = {0: "#FF8000", 1: "#DB5182", 2: "#3EC0FF", 3: "#FF4F4F", 4: "#FBEB7D"};
    return initials[val];
}

document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll("input[type=color]").forEach((picker) => {
        picker.value = initialColour(picker);
        picker.addEventListener("change", recalculate, false);
        pickers[picker.id] = picker;
    });
    let multiplier = document.querySelector("input#multiplier");
    let multiplier_val = document.querySelector("output#multiplier_val");
    multiplier_val.textContent = multiplier.value + "x";
    multiplier.addEventListener("input", (event) => {
        multiplier_val.textContent = event.target.value + "x";
        recalculate();
    });
    recalculate();
}, false);
