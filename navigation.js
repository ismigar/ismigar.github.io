(() => {
  const navbar = document.querySelector(".navbar");
  const toggle = document.querySelector(".nav-toggle");
  const navigation = document.querySelector("#site-navigation");

  if (!navbar || !toggle || !navigation) {
    return;
  }

  const closeNavigation = () => {
    navbar.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    navbar.classList.toggle("is-open", !expanded);
    toggle.setAttribute("aria-expanded", String(!expanded));
  });

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeNavigation();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      closeNavigation();
      toggle.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!navbar.contains(event.target)) {
      closeNavigation();
    }
  });

  window.matchMedia("(min-width: 769px)").addEventListener("change", (event) => {
    if (event.matches) {
      closeNavigation();
    }
  });

  const sectionLinks = [...navigation.querySelectorAll('a[href^="#"]')];
  const sections = sectionLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const setActiveSection = (section) => {
    sectionLinks.forEach((link) => {
      const active = section && link.getAttribute("href") === `#${section.id}`;
      link.classList.toggle("active", Boolean(active));
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  if (sections.length && "IntersectionObserver" in window) {
    const visibleSections = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target, entry.intersectionRatio);
          } else {
            visibleSections.delete(entry.target);
          }
        });

        const activeSection = [...visibleSections.entries()]
          .sort((left, right) => right[1] - left[1])[0]?.[0];
        setActiveSection(activeSection || null);
      },
      { rootMargin: "-20% 0px -55%", threshold: [0, 0.15, 0.35, 0.6] },
    );

    sections.forEach((section) => observer.observe(section));
  }
})();
