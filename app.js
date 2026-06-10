const productGrid = document.querySelector("#productGrid");
const catalog = document.querySelector("#catalog");
const template = document.querySelector("#productTemplate");
const dialog = document.querySelector("#orderDialog");
const form = document.querySelector("#orderForm");
const formStatus = document.querySelector("#formStatus");
const closeButton = document.querySelector(".close-button");
const catalogCart = document.querySelector("#catalogCart");
const cartCount = document.querySelector("#cartCount");
const productDetail = document.querySelector("#productDetail");
const detailBack = document.querySelector("#detailBack");
const detailCart = document.querySelector(".detail-cart");
const detailPrev = document.querySelector("#detailPrev");
const detailNext = document.querySelector("#detailNext");
const detailMedia = document.querySelector("#detailMedia");
const detailDots = document.querySelector("#detailDots");
const detailTitle = document.querySelector("#detailTitle");
const detailDescription = document.querySelector("#detailDescription");
const detailPrice = document.querySelector("#detailPrice");
const detailAdd = document.querySelector("#detailAdd");
const detailCartCount = document.querySelector("#detailCartCount");
const checkoutCartCount = document.querySelector("#checkoutCartCount");
const summaryTotal = document.querySelector("#summaryTotal");
const summaryItem = document.querySelector(".summary-item");
const summaryTotals = document.querySelector(".summary-totals");
const emptyCartMessage = document.querySelector("#emptyCartMessage");
const orderSentMessage = document.querySelector("#orderSentMessage");
const quantityInput = document.querySelector("#quantityInput");
const quantityValue = document.querySelector("#quantityValue");
const qtyMinus = document.querySelector("#qtyMinus");
const qtyPlus = document.querySelector("#qtyPlus");
const checkoutScrolledClass = "is-scrolled";

const formatPrice = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

let products = [];
let selectedProductIndex = 0;
let selectedImageIndex = 0;
let cartItemsCount = 0;
let cartProductId = "";
let catalogScrollY = 0;
let detailWheelLocked = false;
let detailScrollFrame = 0;
const imagePreloadCache = new Set();
const mobileGalleryQuery = window.matchMedia("(max-width: 900px)");

init();

async function init() {
  setCartCount(0);
  products = await fetchProducts();
  renderProducts();
  bindProductDetail();
  bindCartButtons();
  bindOrderForm();
}

async function fetchProducts() {
  const response = await fetch("/api/products");

  if (!response.ok) {
    throw new Error("Не удалось загрузить каталог");
  }

  const data = await response.json();
  return data.products || [];
}

function renderProducts() {
  productGrid.innerHTML = "";

  products.forEach((product, index) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const button = card.querySelector(".product-button");
    const visual = card.querySelector(".product-visual");
    const image = card.querySelector("img");
    const title = card.querySelector(".product-title");
    const layout = product.layout || {};

    card.style.setProperty("--x", Number(layout.x || 0));
    card.style.setProperty("--y", Number(layout.y || 0));
    card.style.setProperty("--w", Number(layout.w || 320));
    card.style.setProperty("--h", Number(layout.h || 320));
    card.style.setProperty("--mobile-ratio", `${Number(layout.w || 320)} / ${Number(layout.h || 320)}`);
    title.textContent = product.name;
    button.setAttribute("aria-label", `Открыть ${product.name}`);
    button.addEventListener("click", () => openProductDetail(product.id));

    if (product.image) {
      image.src = product.image;
      image.hidden = false;
      image.loading = index < 2 ? "eager" : "lazy";
      image.decoding = "async";
      image.fetchPriority = index === 0 ? "high" : "low";
      image.sizes = "(max-width: 900px) calc(100vw - 28px), 33vw";
      visual.classList.add("has-image");
    }

    productGrid.append(card);
  });
}

function bindProductDetail() {
  detailBack.addEventListener("click", closeProductDetail);
  detailPrev.addEventListener("click", () => navigateImage(-1));
  detailNext.addEventListener("click", () => navigateImage(1));
  detailMedia.addEventListener("scroll", handleDetailImageScroll, { passive: true });
  detailMedia.addEventListener("wheel", handleDetailImageWheel, { passive: false });
  detailAdd.addEventListener("click", handleDetailAdd);

  document.addEventListener("keydown", (event) => {
    if (productDetail.hidden) {
      return;
    }

    if (event.key === "Escape") {
      closeProductDetail();
    }

    if (event.key === "ArrowLeft") {
      navigateImage(-1);
    }

    if (event.key === "ArrowRight") {
      navigateImage(1);
    }
  });
}

function bindCartButtons() {
  [catalogCart, detailCart].forEach((button) => {
    if (!button) {
      return;
    }

    button.addEventListener("click", openCart);
  });
}

function openProductDetail(productId) {
  const index = products.findIndex((product) => product.id === productId);
  selectedProductIndex = Math.max(0, index);
  selectedImageIndex = 0;
  catalogScrollY = window.scrollY;
  catalog.hidden = true;
  productDetail.hidden = false;
  document.body.classList.add("is-detail");
  renderProductDetail();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function closeProductDetail() {
  productDetail.hidden = true;
  catalog.hidden = false;
  document.body.classList.remove("is-detail");
  requestAnimationFrame(() => {
    window.scrollTo({ top: catalogScrollY, behavior: "auto" });
  });
}

function navigateImage(direction) {
  const images = getProductImages(products[selectedProductIndex]);

  if (images.length <= 1) {
    return;
  }

  selectedImageIndex = (selectedImageIndex + direction + images.length) % images.length;
  renderProductDetail();
}

function renderProductDetail() {
  const product = products[selectedProductIndex];

  if (!product) {
    return;
  }

  detailTitle.textContent = product.name;
  const detailCopy = product.description || "";
  detailDescription.textContent = detailCopy;
  detailDescription.hidden = !detailCopy;
  detailPrice.textContent = formatPrice.format(product.price || 0);
  setCartCount(cartItemsCount);
  const images = getProductImages(product);
  const currentImage = images[selectedImageIndex] || "";
  renderDetailImages(images);
  detailMedia.classList.toggle("has-image", Boolean(currentImage));
  detailMedia.classList.toggle("has-gallery", images.length > 1);
  detailMedia.setAttribute("aria-label", product.name);
  preloadAdjacentDetailImages(images);
  const isInCart = cartProductId === product.id && cartItemsCount > 0;
  detailAdd.textContent = isInCart ? "В корзину" : "Добавить";
  detailAdd.setAttribute(
    "aria-label",
    isInCart ? "Перейти к оформлению товара" : "Добавить товар в корзину"
  );
  const hasGallery = images.length > 1;
  detailPrev.hidden = !hasGallery;
  detailNext.hidden = !hasGallery;
  detailDots.hidden = !hasGallery;
  detailDots.innerHTML = "";

  images.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.className = index === selectedImageIndex ? "active" : "";
    detailDots.append(dot);
  });

  scrollDetailGalleryToSelected();
}

function renderDetailImages(images) {
  detailMedia.innerHTML = "";

  images.forEach((src, index) => {
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.loading = index === selectedImageIndex ? "eager" : "lazy";
    image.fetchPriority = index === selectedImageIndex ? "high" : "low";
    image.src = src;
    image.className = index === selectedImageIndex ? "is-active" : "";
    image.dataset.index = String(index);
    detailMedia.append(image);
  });
}

function handleDetailImageWheel(event) {
  const images = getProductImages(products[selectedProductIndex]);

  if (images.length <= 1 || isMobileDetailGallery()) {
    return;
  }

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

  if (Math.abs(delta) < 8) {
    return;
  }

  event.preventDefault();

  if (detailWheelLocked) {
    return;
  }

  detailWheelLocked = true;
  navigateImage(delta > 0 ? 1 : -1);
  window.setTimeout(() => {
    detailWheelLocked = false;
  }, 280);
}

function handleDetailImageScroll() {
  if (!isMobileDetailGallery()) {
    return;
  }

  if (detailScrollFrame) {
    return;
  }

  detailScrollFrame = requestAnimationFrame(() => {
    detailScrollFrame = 0;
    const images = getProductImages(products[selectedProductIndex]);
    const nextIndex = Math.max(
      0,
      Math.min(images.length - 1, Math.round(detailMedia.scrollLeft / detailMedia.clientWidth))
    );

    if (nextIndex === selectedImageIndex) {
      return;
    }

    selectedImageIndex = nextIndex;
    updateDetailGalleryState(images);
  });
}

function updateDetailGalleryState(images) {
  Array.from(detailMedia.querySelectorAll("img")).forEach((image, index) => {
    image.classList.toggle("is-active", index === selectedImageIndex);
    image.fetchPriority = index === selectedImageIndex ? "high" : "low";
  });

  Array.from(detailDots.children).forEach((dot, index) => {
    dot.classList.toggle("active", index === selectedImageIndex);
  });

  preloadAdjacentDetailImages(images);
}

function scrollDetailGalleryToSelected() {
  requestAnimationFrame(() => {
    if (!isMobileDetailGallery()) {
      return;
    }

    detailMedia.scrollTo({
      left: selectedImageIndex * detailMedia.clientWidth,
      behavior: "auto"
    });
  });
}

function isMobileDetailGallery() {
  return mobileGalleryQuery.matches && detailMedia.classList.contains("has-gallery");
}

function handleDetailAdd() {
  const product = products[selectedProductIndex];

  if (!product) {
    return;
  }

  if (cartProductId === product.id && cartItemsCount > 0) {
    openOrder(product);
    return;
  }

  cartProductId = product.id;
  setCartCount(1);
  renderProductDetail();
}

function openCart() {
  if (cartItemsCount <= 0 || !cartProductId) {
    return;
  }

  const product = products.find((item) => item.id === cartProductId);

  if (product) {
    openOrder(product);
  }
}

function openOrder(product) {
  if (!product) {
    return;
  }

  const productIndex = products.findIndex((item) => item.id === product.id);

  if (productIndex >= 0) {
    const isCurrentProduct = products[selectedProductIndex]?.id === product.id;
    selectedProductIndex = productIndex;
    selectedImageIndex = isCurrentProduct ? selectedImageIndex : 0;
  }

  form.reset();
  formStatus.textContent = "";
  formStatus.className = "form-status";
  resetCheckoutSummary();
  quantityInput.value = "1";
  quantityValue.textContent = "1";
  document.querySelector("#productId").value = product.id;
  document.querySelector("#dialogTitle").textContent = product.name;
  const dialogDescription = document.querySelector("#dialogDescription");
  const dialogDescriptionText = product.description || "";
  dialogDescription.textContent = dialogDescriptionText;
  dialogDescription.hidden = !dialogDescriptionText;
  document.querySelector("#dialogPrice").textContent = formatPrice.format(product.price);
  cartProductId = product.id;
  setCartCount(1);
  updateOrderSummary(product);

  const visual = document.querySelector("#dialogVisual");
  visual.className = "summary-visual product-visual large";
  const orderImage = getProductImages(product)[selectedImageIndex] || product.image || "";
  visual.style.backgroundImage = orderImage ? `url("${orderImage}")` : "";
  visual.classList.toggle("has-image", Boolean(orderImage));

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }

  dialog.classList.remove(checkoutScrolledClass);
  dialog.scrollTop = 0;
  form.scrollTop = 0;
  updateCheckoutBackButton();
  requestAnimationFrame(updateCheckoutBackButton);
}

function bindOrderForm() {
  closeButton.addEventListener("click", () => dialog.close());

  qtyMinus.addEventListener("click", () => adjustQuantity(-1));
  qtyPlus.addEventListener("click", () => adjustQuantity(1));

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  dialog.addEventListener("scroll", updateCheckoutBackButton, { passive: true });
  dialog.addEventListener("close", () => {
    dialog.classList.remove(checkoutScrolledClass);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if ((Number(quantityInput.value) || 0) < 1) {
      setStatus("Корзина пустая.", "error");
      return;
    }

    setStatus("Отправляем заказ...", "");

    const submitButton = form.querySelector(".submit-button");
    submitButton.disabled = true;

    try {
      const response = await fetch("/api/order", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не удалось отправить заказ");
      }

      showOrderSentMessage();
      form.reset();
      cartProductId = "";
      setCartCount(0);
      renderProductDetail();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

function updateCheckoutBackButton() {
  if (!dialog.open) {
    return;
  }

  const scrollTop = Math.max(dialog.scrollTop, form.scrollTop);
  dialog.classList.toggle(checkoutScrolledClass, scrollTop > 4);
}

function resetCheckoutSummary() {
  summaryItem.hidden = false;
  summaryTotals.hidden = false;
  form.querySelector(".submit-button").hidden = false;
  emptyCartMessage.hidden = true;
  orderSentMessage.hidden = true;
}

function showOrderSentMessage() {
  summaryItem.hidden = true;
  summaryTotals.hidden = true;
  form.querySelector(".submit-button").hidden = true;
  emptyCartMessage.hidden = true;
  orderSentMessage.hidden = false;
  formStatus.textContent = "";
  formStatus.className = "form-status";
}

function adjustQuantity(delta) {
  const current = Number(quantityInput.value) || 0;
  const next = Math.min(20, Math.max(0, current + delta));
  quantityInput.value = String(next);
  quantityValue.textContent = String(next);
  updateOrderSummary(products[selectedProductIndex]);
}

function setStatus(message, type) {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`.trim();
}

function setCartCount(value) {
  cartItemsCount = Math.max(0, Number(value) || 0);

  [cartCount, detailCartCount, checkoutCartCount].forEach((element) => {
    if (!element) {
      return;
    }

    element.textContent = cartItemsCount > 0 ? String(cartItemsCount) : "";
    element.hidden = cartItemsCount <= 0;
  });
}

function updateOrderSummary(product) {
  if (!product) {
    return;
  }

  const quantity = Math.min(20, Math.max(0, Number(quantityInput.value) || 0));
  quantityInput.value = String(quantity);
  quantityValue.textContent = String(quantity);
  const isEmpty = quantity === 0;
  summaryItem.hidden = isEmpty;
  summaryTotals.hidden = isEmpty;
  form.querySelector(".submit-button").hidden = isEmpty;
  emptyCartMessage.hidden = !isEmpty;
  orderSentMessage.hidden = true;
  formStatus.textContent = "";

  if (isEmpty) {
    cartProductId = "";
    setCartCount(0);
    renderProductDetail();
    return;
  }

  cartProductId = product.id;
  setCartCount(quantity);
  const total = (Number(product.price) || 0) * quantity;
  summaryTotal.textContent = formatPrice.format(total);
  document.querySelector("#dialogPrice").textContent = formatPrice.format(total);
}

function getProductImages(product) {
  if (!product) {
    return [];
  }

  if (Array.isArray(product.images) && product.images.length) {
    return product.images.filter(Boolean);
  }

  return product.image ? [product.image] : [];
}

function preloadAdjacentDetailImages(images) {
  if (images.length <= 1) {
    return;
  }

  const previousImage = images[(selectedImageIndex - 1 + images.length) % images.length];
  const nextImage = images[(selectedImageIndex + 1) % images.length];
  preloadImage(previousImage);
  preloadImage(nextImage);
}

function preloadImage(src) {
  if (!src || imagePreloadCache.has(src)) {
    return;
  }

  const image = new Image();
  image.decoding = "async";
  image.src = src;
  imagePreloadCache.add(src);
}
