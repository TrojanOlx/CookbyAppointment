Component({
  properties: {
    type: {
      type: String,
      value: 'primary'
    },
    block: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    handleTap(event) {
      if (this.data.disabled) return;
      this.triggerEvent('tap', event.detail);
    }
  }
});
