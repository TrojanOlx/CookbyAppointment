Component({
  properties: {
    items: {
      type: Array,
      value: []
    },
    active: {
      type: String,
      value: ''
    }
  },
  methods: {
    handleTap(event) {
      const key = event.currentTarget.dataset.key;
      this.triggerEvent('change', { key });
    }
  }
});
