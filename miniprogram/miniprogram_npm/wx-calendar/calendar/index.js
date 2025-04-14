// plugin/components/lxf-calendar.js
function double(n) {
  n = Number(n)
  return n < 10 ? ('0' + n) : String(n)
}


Component({
  /**
   * 组件的属性列表
   */
  properties: {
    daysProps: {
      type: Array,
      value: []
    },
    props: {
      type: Object,
      value: {
        showOtherMonth: false, // 显示非本月日期
        disabledOtherMonth: false, // 非本月日期不可点击
        single: false, // 显示'1'而不是'01'
      }
    },
    weeks: {
      type: Array,
      value: ['日', '一', '二', '三', '四', '五', '六'], //星期
    },
    loading: {
      type: Boolean,
      value: false
    }
  },
  options: {
    styleIsolation: 'apply-shared'
  },

  /**
   * 组件的初始数据
   */
  data: {
    year: double(2000), // 年
    month: double(1),// 月
    date: double(1),//日
    total: '2020-01-01',
    datesForRender: [],
    dates: [],
    selectedDate: {

    }, // 已选择的日期
  },
  observers: {
    // daysProps是跟dates对应的,所以切换了月份,daysProps就消失了,知道重新设置daysProps
    // props是全局(对整个日历组件的配置)的多以一直生效
    // 结果就是:daysProps和props的变化会改变dates,但dates改变后只根据props而变化,而daysProps就废弃掉了,除非回调函数返回了新的daysProps
    'daysProps,props'() {
      this.setData({
        dates: this.editDates(this.data.dates)
      })
    },
    'dates'(dates) {
      this.generateDatesForRender(dates)
    }
  },
  lifetimes: {
    attached() {
      this.start()
    },
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 获取'今天'
    start() {
      let present = new Date()
      let year = double(present.getFullYear())
      let month = double(present.getMonth() + 1)
      let date = double(present.getDate())
      this.setData({
        year,
        month,
        date,
        total: `${year}-${month}-${date}`
      })
      this.update()
    },
    // 更新 dates 原始数据
    update(isEvent) {
      if (this.data.loading) return console.log('loading')
      let params;
      switch (isEvent) {
        case 'py':
          params = {
            year: double(--this.data.year)
          }
          break
        case 'ny':
          params = {
            year: double(++this.data.year)
          }
          break;
        case 'pm':
          {
            let month = double(--this.data.month)
            params = month < 1 ? ({
              month: double(12),
              year: double(--this.data.year)
            }) : ({ month })
          }
          break
        case 'nm':
          {
            let month = double(++this.data.month);
            params = month > 12 ? ({
              month: double(1),
              year: double(++this.data.year)
            }) : ({
              month
            })
          }
          break
      }
      this.setData(params)
      let { dates, nextM, previousM } = this.generateDates(this.data.year, this.data.month)
      // 触发父级的切换年(月)事件
      if (isEvent) {
        this.triggerEvent('onswitch', { year: this.data.year, month: this.data.month })
        this.setData({
          dates,
          nextM,
          previousM
        })
      } else {
        this.setData({
          dates: this.editDates(dates),
          nextM,
          previousM
        })
      }
    },
    // 根据daysProps编辑 dates 数据
    editDates(dates) {
      // 设置本月每一天的特性(自定义类名,能否点击...)
      this.data.daysProps.forEach(dayProps => {
        if (dayProps.d < 1 || dayProps.d > dates.endIndex - dates.startIndex) return //不设置其他月份日期的样式
        let date = dates[dayProps.d + dates.startIndex - 1]
        if (date) { date = Object.assign(date, dayProps.set) }
      })
      return dates
    },
    // 选择日期，单选
    select(e) {
      let { selectedDate, x, y } = e.currentTarget.dataset
      console.log(selectedDate)
      if (selectedDate.disabled) return
      if (selectedDate.selected) return
      let a, b = -1;
      a = this.data.datesForRender.findIndex(row => {
        b = row.findIndex(date => date.selected)
        return b >= 0
      })
      if (b >= 0) {
        this.setData({
          [`datesForRender[${a}][${b}].selected`]: false,
          [`datesForRender[${x}][${y}].selected`]: true,
          selectedDate
        })
      } else {
        this.setData({
          [`datesForRender[${x}][${y}].selected`]: true,
          selectedDate
        })
      }
      this.triggerEvent('onselect', { selectedDate})
    },
    /**
     * 根据年月生成生成日期
     * @param {String} y 
     * @param {String} m
     */
    generateDates(year, month) {
      year = double(year)
      month = double(month)
      let total = 42; //日历固定6行，每行7天，一行从周日开始。至于为啥，自己想想。
      let start = new Date(year, month - 1)
      let end = new Date(year, month, 0)

      let previousMonthEnd = new Date(year, month - 1, 0) // 上一个月最后一天的 Date 对象
      let previousM = {
        y: double(previousMonthEnd.getFullYear()),// 上个月 最后一日
        m: double(previousMonthEnd.getMonth() + 1), //上个月 月
        d: double(previousMonthEnd.getDate()) //上个月 年
      }

      let nextMonthStart = new Date(year, month) //下个月第一天的 Date 对象
      let nextM = {
        y: double(nextMonthStart.getFullYear()), //下个月 第一日
        m: double(nextMonthStart.getMonth() + 1), //下个月 月
        d: double(nextMonthStart.getDate())//下个月 年
      }

      let beforeDates;
      let startWeek;
      startWeek = beforeDates = start.getDay()

      let endDate = end.getDate();
      let afterDates;
      afterDates = 42 - endDate - beforeDates;

      let dates = []
      dates.startIndex = startWeek//dates 中该月第一天的index
      dates.endIndex = startWeek + endDate - 1//dates 中该月最后一天的index
      /*
        dates.nextM = nextM
        dates.previousM = previousM
        dates是Array,这种写法在渲染wxml时无效果
      */
      let w = 0
      for (let i = -startWeek; i < endDate + afterDates; i++) {
        let y, m, d, type;
        if (i < 0) {
          y = previousM.y
          m = previousM.m
          d = Number(previousM.d) + i
          type = 'before'
        } else if (i >= endDate) {
          y = nextM.y
          m = nextM.m
          d = i - endDate
          type = 'after'
        } else {
          d = i
          m = month
          y = year
          type = 'on'
        }


        d = double(++d)
        total = `${y}-${m}-${d}`
        let date = {
          week: w++ % 7,// 星期
          y,// 年
          m,// 月
          d, // 日
          type,
          total,
          disabled: false,
          visible: true,
          selected: this.data.selectedDate.total === total,
          class: '',
          isToday: this.data.total === total
        }
        dates.push(date) // html用
      }
      return { dates, nextM, previousM }
    },
    // dates 转化为 datesForRender
    generateDatesForRender(dates) {
      let datesForRender = [[], [], [], [], [], []]
      // props 配置
      dates.forEach((date, dateIndex) => {
        if (date.type !== "on") {
          if (!this.data.props.showOtherMonth) {
            date.visible = false
          }
          if (this.data.props.disabledOtherMonth) {
            date.disabled = true
          }
        }
        let a = Math.floor(dateIndex / 7)
        datesForRender[a].push(date)
      })
      this.setData({
        datesForRender
      })
    },
    previousYear() {
      this.update('py')
    },
    nextYear() {
      this.update('ny')
    },
    previousMonth() {
      this.update('pm')
    },
    nextMonth() {
      this.update('nm')
    },

  }
})