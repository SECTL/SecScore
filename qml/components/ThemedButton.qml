import QtQuick
import QtQuick.Controls

Button {
    id: control
    
    // 直接从mainApp获取颜色，如果mainApp不可用则使用默认值
    property color buttonBgColor: (typeof mainApp !== 'undefined' && mainApp.colors && mainApp.colors.button) ? mainApp.colors.button : "#e0e0e0"
    property color buttonTextColor: (typeof mainApp !== 'undefined' && mainApp.colors && mainApp.colors.text) ? mainApp.colors.text : "#2c3e50"
    property int buttonRadius: (typeof mainApp !== 'undefined' && mainApp.currentRadius) ? mainApp.currentRadius : 8
    
    background: Rectangle {
        color: control.down ? Qt.darker(control.buttonBgColor, 1.1) : 
               control.hovered ? Qt.lighter(control.buttonBgColor, 1.1) : 
               control.buttonBgColor
        radius: control.buttonRadius
        border.color: Qt.darker(control.buttonBgColor, 1.2)
        border.width: 1
    }
    
    contentItem: Text {
        text: control.text
        font: control.font
        color: control.buttonTextColor
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    
    // 监听主题变化，更新颜色
    Connections {
        target: typeof mainApp !== 'undefined' ? mainApp : null
        function onColorsChanged() {
            // 重新读取颜色值
            buttonBgColor = (mainApp.colors && mainApp.colors.button) ? mainApp.colors.button : "#e0e0e0"
            buttonTextColor = (mainApp.colors && mainApp.colors.text) ? mainApp.colors.text : "#2c3e50"
        }
    }
    
    Connections {
        target: typeof mainApp !== 'undefined' ? mainApp : null
        function onUiMetricsChanged() {
            // 更新圆角半径
            buttonRadius = mainApp.currentRadius || 8
        }
    }
}

