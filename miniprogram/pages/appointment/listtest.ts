// pages/touchMove2/index.js
interface CardItem {
  id: string;
  name: string;
  xmove: number;
}

interface PageData {
  cardList: CardItem[];
}

interface PageInstance {
  data: PageData;
  startX: number;
  handleTouchStart: (e: TouchEvent) => void;
  handleTouchEnd: (e: TouchEvent) => void;
  showDeleteButton: (e: TouchEvent) => void;
  hideDeleteButton: (e: TouchEvent) => void;
  setXmove: (index: number, xmove: number) => void;
  handleMovableChange: (e: MovableEvent) => void;
  onLoad: () => void;
  onShow: () => void;
  handleDelete: (e: TouchEvent) => void;
  itemDel: (id: string) => void;
}

interface TouchEvent {
  touches: { pageX: number }[];
  changedTouches: { pageX: number }[];
  currentTarget: {
    dataset: {
      index: number;
      id: string;
    };
  };
}

interface MovableEvent {
  detail: {
    source: string;
    x: number;
  };
}

Page<PageData, PageInstance>({

  /**
   * 页面的初始数据
   */
  data: {
    cardList:[
      {
        id:'1',
        name:'左滑试试吧',
        xmove:0,
      }, 
      {
        id:'2',
        name:'左滑试试吧',
        xmove:0,
      },
      {
        id:'3',
        name:'左滑试试吧',
        xmove:0,
      },
      {
        id:'4',
        name:'左滑试试吧',
        xmove:0,
      }, 
    ]
  },

  startX: 0,

  /**
     * 处理touchstart事件
     */
    handleTouchStart(e: TouchEvent) {
      this.startX = e.touches[0].pageX
  },

  /**
   * 处理touchend事件
   */
  handleTouchEnd(e: TouchEvent) {
      if (e.changedTouches[0].pageX < this.startX && e.changedTouches[0].pageX - this.startX <= -30) {
          this.showDeleteButton(e)
      } else if (e.changedTouches[0].pageX > this.startX && e.changedTouches[0].pageX - this.startX < 30) {
          this.showDeleteButton(e)
      } else {
          this.hideDeleteButton(e)
      }
  },
  /**
     * 显示删除按钮
     */
    showDeleteButton(e: TouchEvent) {
      let index = e.currentTarget.dataset.index;
      this.setXmove(index, -65);
  },

  /**
   * 隐藏删除按钮
   */
  hideDeleteButton(e: TouchEvent) {
      let index = e.currentTarget.dataset.index;
      this.setXmove(index, 0);
  },

  /**
   * 设置movable-view位移
   */
  setXmove(index: number, xmove: number) {
      let {cardList} = this.data;
      cardList[index].xmove = xmove;
      this.setData({
        cardList: cardList
      })
      console.log(this.data.cardList)
  },

  /**
   * 处理movable-view移动事件
   */
  handleMovableChange(e: MovableEvent) {
      if (e.detail.source === 'friction') {
          if (e.detail.x < -30) {
              this.showDeleteButton(e as unknown as TouchEvent)
          } else {
              this.hideDeleteButton(e as unknown as TouchEvent)
          }
      } else if (e.detail.source === 'out-of-bounds' && e.detail.x === 0) {
          this.hideDeleteButton(e as unknown as TouchEvent)
      }
  },
  onLoad() {

  },


 
  onShow() {

  },
  handleDelete(e: TouchEvent) {
    let {id} = e.currentTarget.dataset;
    this.itemDel(id)
  },
  itemDel(id: string){
    const index = this.data.cardList.findIndex(item => item.id === id);
    if (index !== -1) {
      const newCardList = [...this.data.cardList];
      newCardList.splice(index, 1);
      this.setData({
        cardList: newCardList
      });
      wx.showToast({
        title: '删除成功',
        icon:'success'
      })
    }
  }
 
})
