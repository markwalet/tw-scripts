// Academy page (screen=snob), modelled on a real enc1 page (price 72, stored 15): price row,
// stored row, then the training table's "still required" cell, all as "<n> x <img res>".
const res = '<img src="https://dsen.innogamescdn.com/asset/x/graphic/res.webp" data-title="28000, 30000, 25000">';

/** @param {number} price @param {number} stored */
export const academyPage = (price, stored) => `
<h2>Academy (Level 2)</h2>
<table class="vis" width="100%"><tbody>
 <tr><td>Price for next nobleman:</td><td align="center">${price} x ${res}</td>
     <td><span class="nowrap"><span class="icon header wood"> </span>2<span class="grey">.</span>016<span class="grey">.</span>000</span></td></tr>
 <tr><td>Stored resources:</td><td align="center">${stored} x ${res}</td><td>420.000</td></tr>
</tbody></table><br>
<script>$(function(){ BuildingSnob.Modes.train.next_snob = {"id":"next_snob","wood":28000,"stone":30000,"iron":25000}; });</script>
<table class="vis"><tr><th>Unit</th><th colspan="3">still required</th></tr>
 <tr><td><a class="unit_link" data-unit="snob">Nobleman</a></td>
     <td width="60" align="center" class="nowrap">${Math.max(0, price - stored)} x ${res}</td></tr></table>
<h4>Number of noblemen that can be educated</h4>
<table class="vis"><tr><td>Number of academies:</td><td>118</td></tr><tr><th>You can still educate:</th><th>47</th></tr></table>`;
