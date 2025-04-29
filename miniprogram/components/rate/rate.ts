Component({
  properties: {
    value: {
      type: Number,
      value: 0
    },
    showText: {
      type: Boolean,
      value: true
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  data: {
    rateText: ['很差', '较差', '一般', '不错', '很好']
  },

  methods: {
    onTap(e: any) {
      if (this.data.disabled) return;
      
      const value = parseInt(e.currentTarget.dataset.value);
      this.setData({
        value
      });
      
      this.triggerEvent('change', { value });
    }
  }
}) 