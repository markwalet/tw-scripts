// Named worlds for the old balancer's failure cases (DESIGN-package-planner.md §9,
// `calculateLaunches` in lllll llll's resBalancer.js). Each comes with the optimum worked
// out by hand, and what the old planning does instead.

const v = (id, x, y, res, merchants = 100, extra = {}) => ({ id, x, y, res, merchants, storage: 400000, academy: false, ...extra });
const academy = (id, x, y, res, merchants = 100, extra = {}) => v(id, x, y, res, merchants, { academy: true, ...extra });

export const balancerFailures = {
  // k-means clusters that resources never cross. With 2 clusters, the west group's mean
  // is 474|500 and the east group's 486.75|500: academy 1 (480) lands west, the iron in
  // village 4 (483) lands east, 3 fields away. The old plan: 0 packages. Optimum: 1.
  clusterBorder: {
    world: {
      villages: [
        v(2, 470, 500, [0, 0, 0]),
        v(3, 472, 500, [0, 0, 0]),
        academy(1, 480, 500, [28000, 30000, 0]),
        v(4, 483, 500, [0, 0, 25000]),
        v(5, 486, 500, [0, 0, 0]),
        v(6, 488, 500, [0, 0, 0]),
        v(7, 490, 500, [0, 0, 0]),
      ],
    },
    options: {},
    expected: { packages: 1, perAcademy: [{ id: 1, packages: 1 }] },
  },

  // Balancing towards the average. Four full sources (400k of each) and an empty academy:
  // the average is 320k, so the old plan fills the academy to 320k at most, which is
  // 10 packages (320k stone / 30k). Its warehouse takes 392k (2% buffer): 13 packages.
  mostlyFullAverage: {
    world: {
      villages: [
        academy(1, 500, 500, [0, 0, 0]),
        v(2, 502, 500, [400000, 400000, 400000], 300),
        v(3, 498, 500, [400000, 400000, 400000], 300),
        v(4, 500, 502, [400000, 400000, 400000], 300),
        v(5, 500, 498, [400000, 400000, 400000], 300),
      ],
    },
    options: {},
    expected: { packages: 13, perAcademy: [{ id: 1, packages: 13 }] },
  },

  // Targets filled one by one from their nearest sources. Source 3 is 5 fields from both
  // academies, source 4 is 7 fields from academy 1 and out of range (max 10 fields) of
  // academy 2. Nearest-first gives academy 1 source 3's package and starves academy 2:
  // 1 package. Optimum: 4 -> 1 and 3 -> 2, 2 packages.
  nearestFirstStarvation: {
    world: {
      villages: [
        academy(1, 500, 500, [0, 0, 0]),
        academy(2, 510, 500, [0, 0, 0]),
        v(3, 505, 500, [28000, 30000, 25000]),
        v(4, 493, 500, [28000, 30000, 25000]),
      ],
    },
    options: { maxTravelSeconds: 10 * 360 },
    expected: { packages: 2, perAcademy: [{ id: 1, packages: 1 }, { id: 2, packages: 1 }] },
  },

  // Sends under 700 dropped: the academy lacks 400 iron. The old plan drops the 400
  // send, so no package. Optimum: one merchant carries 400 iron, 1 package.
  smallSendDropped: {
    world: {
      villages: [academy(1, 500, 500, [28000, 30000, 24600]), v(2, 503, 504, [0, 0, 5000])],
    },
    options: {},
    expected: { packages: 1, perAcademy: [{ id: 1, packages: 1 }], transports: [{ from: 2, to: 1, res: [0, 0, 400], merchants: 1, seconds: 1800 }] },
  },

  // Remainders cut after they were taken off the books: the academy lacks 27,600 wood.
  // The old plan cuts the 600 remainder (< 700) and sends 27,000, so the package is 600
  // short. Optimum: 27,600 in 28 merchants (the last one partial), 1 package.
  remainderCut: {
    world: {
      villages: [academy(1, 500, 500, [400, 30000, 25000]), v(2, 503, 504, [40000, 0, 0])],
    },
    options: {},
    expected: { packages: 1, perAcademy: [{ id: 1, packages: 1 }], transports: [{ from: 2, to: 1, res: [27600, 0, 0], merchants: 28, seconds: 1800 }] },
  },
};
