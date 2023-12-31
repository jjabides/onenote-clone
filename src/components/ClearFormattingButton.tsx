import "../styles/clear-formatting-btn.css";
import ClearFormatting from "../images/ClearFormatting.svg";

interface ClearFormattingButtonProps {
    onClick: () => void;
}

export default function ClearFormattingButton({ onClick }: ClearFormattingButtonProps) {

    return <div className="clear-formatting-btn btn border-radius-4" onClick={onClick}>
        <img src={ClearFormatting} draggable="false"/>
    </div>
}